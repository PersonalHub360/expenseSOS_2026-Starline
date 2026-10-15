import { eq } from "drizzle-orm";
import { writeAudit } from "../audit/log";
import { Router, type Request } from "express";
import { requireAuth, requirePermission, type Principal } from "../auth/principal";
import { db } from "../db/client";
import { documents, employees, investments, projects, units } from "../db/schema";
import { createExpense, OperationDenied } from "../expenses/commands";
import { todayUtc } from "../expenses/dates";
import { listProjects, listPropertyBoard, projectDetail, replaceStaff, syncProjectUnits } from "./queries";
import { parseDocument, parseExpense, parseInvestment, parseProject } from "./validate";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/directory", requirePermission("projects", "view"), async (_req, res) => {
  const rows = await db
    .select({ id: employees.id, name: employees.name, jobTitle: employees.jobTitle })
    .from(employees)
    .orderBy(employees.name);
  res.json({ staff: rows });
});

projectsRouter.get("/", requirePermission("projects", "view"), async (_req, res) => {
  res.json({ projects: await listProjects() });
});

projectsRouter.get("/portfolio", requirePermission("properties", "view"), async (_req, res) => {
  res.json({ projects: await listPropertyBoard() });
});

projectsRouter.post("/", requirePermission("projects", "add"), async (req, res) => {
  const parsed = parseProject(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const [created] = await db
      .insert(projects)
      .values(projectValues(parsed.value))
      .returning({ id: projects.id });
    if (!created) throw new Error("Project was not stored.");
    const staff = await replaceStaff(created.id, parsed.value.staffIds, parsed.value.staff);
    if (staff.ok) {
      await writeAudit({
        actorId: (res.locals.principal as Principal).id,
        action: "create",
        subjectType: "project",
        subjectId: created.id,
        summary: "Project created",
      });
    }
    if (!staff.ok) {
      await db.delete(projects).where(eq(projects.id, created.id));
      res.status(400).json({ error: staff.error });
      return;
    }
    const stored = await storeUnits(created.id, parsed.value.location, parsed.value.units);
    if (!stored.ok) {
      await db.delete(units).where(eq(units.projectId, created.id));
      await db.delete(projects).where(eq(projects.id, created.id));
      res.status(400).json({ error: stored.error });
      return;
    }
    res.status(201).json(await projectDetail(created.id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A project with this name already exists." });
      return;
    }
    throw error;
  }
});

projectsRouter.get("/:id", requirePermission("projects", "view"), async (req, res) => {
  const detail = await projectDetail(routeId(req));
  if (!detail) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json(detail);
});

projectsRouter.patch("/:id", requirePermission("projects", "edit"), async (req, res) => {
  const parsed = parseProject(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, routeId(req))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  try {
    await db.update(projects).set({ ...projectValues(parsed.value), updatedAt: new Date() }).where(eq(projects.id, existing.id));
    const staff = await replaceStaff(existing.id, parsed.value.staffIds, parsed.value.staff);
    if (!staff.ok) {
      res.status(400).json({ error: staff.error });
      return;
    }
    const stored = await storeUnits(existing.id, parsed.value.location, parsed.value.units);
    if (!stored.ok) {
      res.status(400).json({ error: stored.error });
      return;
    }
    await writeAudit({
      actorId: (res.locals.principal as Principal).id,
      action: "update",
      subjectType: "project",
      subjectId: existing.id,
      summary: "Project updated",
    });
    res.json(await projectDetail(existing.id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A project with this name already exists." });
      return;
    }
    throw error;
  }
});

projectsRouter.post("/:id/expenses", requirePermission("expenses", "add"), async (req, res) => {
  if (!(await projectExists(routeId(req)))) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const parsed = parseExpense(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const expenseId = await createExpense(res.locals.principal as Principal, {
      projectId: routeId(req),
      vendorId: null,
      amount: parsed.value.amount,
      category: parsed.value.category,
      description: parsed.value.note,
      note: parsed.value.note,
      method: "cash",
      accountId: null,
      spentOn: todayUtc(),
      frequency: null,
      nextDueDate: null,
    });
    await writeAudit({
      actorId: (res.locals.principal as Principal).id,
      action: "create",
      subjectType: "expense",
      subjectId: expenseId,
      summary: "Expense created",
    });
  } catch (error) {
    if (error instanceof OperationDenied) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  res.status(201).json(await projectDetail(routeId(req)));
});

projectsRouter.post("/:id/investments", requirePermission("investments", "add"), async (req, res) => {
  if (!(await projectExists(routeId(req)))) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const parsed = parseInvestment(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const [investment] = await db
    .insert(investments)
    .values({
      projectId: routeId(req),
      investorName: parsed.value.investorName,
      amount: parsed.value.amount,
      note: parsed.value.note,
    })
    .returning({ id: investments.id });
  if (investment) {
    await writeAudit({
      actorId: (res.locals.principal as Principal).id,
      action: "create",
      subjectType: "investment",
      subjectId: investment.id,
      summary: "Investment created",
    });
  }
  res.status(201).json(await projectDetail(routeId(req)));
});

projectsRouter.post("/:id/documents", requirePermission("projects", "edit"), async (req, res) => {
  if (!(await projectExists(routeId(req)))) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const parsed = parseDocument(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  await db.insert(documents).values({ projectId: routeId(req), ...parsed.value });
  await writeAudit({
    actorId: (res.locals.principal as Principal).id,
    action: "create",
    subjectType: "project",
    subjectId: routeId(req),
    summary: "Project document note added",
  });
  res.status(201).json(await projectDetail(routeId(req)));
});

function routeId(req: Request) {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function projectValues(value: {
  name: string;
  location: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  budget: string;
}) {
  return {
    name: value.name,
    location: value.location,
    description: value.description,
    startDate: value.startDate,
    endDate: value.endDate,
    status: value.status,
    budget: value.budget,
  };
}

async function projectExists(id: string) {
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
  return Boolean(row);
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

async function storeUnits(
  projectId: string,
  projectLocation: string,
  drafts: NonNullable<ReturnType<typeof parseProject> & { ok: true }>["value"]["units"],
) {
  if (!drafts) return { ok: true as const };
  try {
    return await syncProjectUnits(
      projectId,
      drafts.map((unit) => ({ ...unit, location: unit.location || projectLocation })),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false as const, error: "This unit number is already used in the project." };
    }
    throw error;
  }
}
