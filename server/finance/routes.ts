import { Router, type Request, type Response } from "express";
import { writeAudit } from "../audit/log";
import { requireAuth, requirePermission, type Principal } from "../auth/principal";
import {
  createAccount,
  createEmployee,
  createInvestment,
  createInvestor,
  createSalarySlip,
  deleteInvestment,
  deleteInvestor,
  deleteInvestorByName,
  FinanceDenied,
  recordInvestmentReturn,
  recordMovement,
  transferFunds,
  updateAccount,
  updateEmployee,
  updateInvestment,
  updateInvestor,
  updateSalarySlip,
} from "./commands";
import { getAccount, getEmployee, getInvestment, getInvestor, getSalarySlip, listAccounts, listEmployees, listInvestments, listInvestors, salarySummary } from "./queries";
import {
  parseAccount,
  parseAccountMovement,
  parseEmployee,
  parseInvestment,
  parseInvestor,
  parseInvestmentReturn,
  parseSalaryMonth,
  parseSalarySlip,
  parseTransfer,
} from "./validate";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const investmentsRouter = Router();
export const investorsRouter = Router();
export const accountsRouter = Router();
export const employeesRouter = Router();

investmentsRouter.use(requireAuth);
investorsRouter.use(requireAuth);
accountsRouter.use(requireAuth);
employeesRouter.use(requireAuth);

investorsRouter.get("/", requirePermission("investments", "view"), async (_req, res) => {
  res.json(await listInvestors());
});

investorsRouter.post("/", requirePermission("investments", "add"), async (req, res) => {
  const parsed = parseInvestor(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const id = await createInvestor(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "investor", subjectId: id, summary: "Investor created" });
    const detail = await getInvestor(id);
    res.status(201).json(detail);
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

investorsRouter.patch("/:id", requirePermission("investments", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Investor not found." });
    return;
  }
  const parsed = parseInvestor(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await updateInvestor(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "investor", subjectId: id, summary: "Investor updated" });
    res.json(await getInvestor(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

investorsRouter.delete("/named", requirePermission("investments", "delete"), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Choose an investor." });
    return;
  }
  try {
    const id = await deleteInvestorByName(principal(res), name);
    if (id) await writeAudit({ actorId: principal(res).id, action: "delete", subjectType: "investor", subjectId: id, summary: "Investor deleted" });
    res.status(204).end();
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

investorsRouter.delete("/:id", requirePermission("investments", "delete"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Investor not found." });
    return;
  }
  try {
    await deleteInvestor(principal(res), id);
    await writeAudit({ actorId: principal(res).id, action: "delete", subjectType: "investor", subjectId: id, summary: "Investor deleted" });
    res.status(204).end();
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

investmentsRouter.get("/", requirePermission("investments", "view"), async (_req, res) => {
  res.json(await listInvestments());
});

investmentsRouter.post("/", requirePermission("investments", "add"), async (req, res) => {
  const parsed = parseInvestment(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const id = await createInvestment(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "investment", subjectId: id, summary: "Investment created" });
    res.status(201).json(await getInvestment(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

investmentsRouter.get("/:id", requirePermission("investments", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Investment not found." });
    return;
  }
  const detail = await getInvestment(id);
  if (!detail) {
    res.status(404).json({ error: "Investment not found." });
    return;
  }
  res.json(detail);
});

investmentsRouter.patch("/:id", requirePermission("investments", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Investment not found." });
    return;
  }
  const parsed = parseInvestment(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await updateInvestment(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "investment", subjectId: id, summary: "Investment updated" });
    res.json(await getInvestment(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

investmentsRouter.delete("/:id", requirePermission("investments", "delete"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Investment not found." });
    return;
  }
  try {
    await deleteInvestment(principal(res), id);
    await writeAudit({ actorId: principal(res).id, action: "delete", subjectType: "investment", subjectId: id, summary: "Investment deleted" });
    res.status(204).end();
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

investmentsRouter.post("/:id/returns", requirePermission("investments", "add"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Investment not found." });
    return;
  }
  const parsed = parseInvestmentReturn(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await recordInvestmentReturn(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "investment", subjectId: id, summary: "Investment return recorded" });
    res.status(201).json(await getInvestment(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

accountsRouter.get("/", requirePermission("accounts", "view"), async (_req, res) => {
  res.json(await listAccounts());
});

accountsRouter.post("/transfers", requirePermission("accounts", "add"), async (req, res) => {
  const parsed = parseTransfer(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await transferFunds(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "account", subjectId: parsed.value.fromAccountId, summary: "Transfer recorded" });
    const [source, target] = await Promise.all([getAccount(parsed.value.fromAccountId), getAccount(parsed.value.toAccountId)]);
    res.status(201).json({ source, target });
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

accountsRouter.post("/", requirePermission("accounts", "add"), async (req, res) => {
  const parsed = parseAccount(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const id = await createAccount(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "account", subjectId: id, summary: "Account created" });
    res.status(201).json(await getAccount(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

accountsRouter.get("/:id", requirePermission("accounts", "view"), async (req, res) => {
  const found = await loadAccount(req, res);
  if (found) res.json(found);
});

accountsRouter.patch("/:id", requirePermission("accounts", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const parsed = parseAccount(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await updateAccount(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "account", subjectId: id, summary: "Account updated" });
    res.json(await getAccount(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

accountsRouter.post("/:id/transactions", requirePermission("accounts", "add"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const parsed = parseAccountMovement(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await recordMovement(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "account", subjectId: id, summary: "Account movement recorded" });
    res.status(201).json(await getAccount(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

employeesRouter.get("/summary", requirePermission("employees", "view"), async (req, res) => {
  const parsed = parseSalaryMonth(req.query.month);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json(await salarySummary(parsed.value));
});

employeesRouter.get("/", requirePermission("employees", "view"), async (_req, res) => {
  res.json(await listEmployees());
});

employeesRouter.post("/", requirePermission("employees", "add"), async (req, res) => {
  const parsed = parseEmployee(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const id = await createEmployee(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "employee", subjectId: id, summary: "Employee created" });
    res.status(201).json(await getEmployee(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

employeesRouter.get("/:id/slips/:slipId", requirePermission("employees", "view"), async (req, res) => {
  const employeeId = routeId(req);
  const slipId = routeKey(req, "slipId");
  if (!employeeId || !slipId) {
    res.status(404).json({ error: "Salary slip not found." });
    return;
  }
  const detail = await getSalarySlip(employeeId, slipId);
  if (!detail) {
    res.status(404).json({ error: "Salary slip not found." });
    return;
  }
  res.json(detail);
});

employeesRouter.patch("/:id/slips/:slipId", requirePermission("employees", "edit"), async (req, res) => {
  const employeeId = routeId(req);
  const slipId = routeKey(req, "slipId");
  if (!employeeId || !slipId) {
    res.status(404).json({ error: "Salary slip not found." });
    return;
  }
  const current = await getEmployee(employeeId);
  if (!current) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  const parsed = parseSalarySlip(req.body, current.employee.monthlySalary);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await updateSalarySlip(principal(res), employeeId, slipId, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "salary", subjectId: slipId, summary: "Salary slip updated" });
    res.json(await getSalarySlip(employeeId, slipId));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

employeesRouter.get("/:id", requirePermission("employees", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  const detail = await getEmployee(id);
  if (!detail) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  res.json(detail);
});

employeesRouter.patch("/:id", requirePermission("employees", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  const parsed = parseEmployee(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await updateEmployee(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "employee", subjectId: id, summary: "Employee updated" });
    res.json(await getEmployee(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

employeesRouter.post("/:id/slips", requirePermission("employees", "add"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  const current = await getEmployee(id);
  if (!current) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  const parsed = parseSalarySlip(req.body, current.employee.monthlySalary);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const slipId = await createSalarySlip(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "salary", subjectId: slipId, summary: "Salary slip created" });
    res.status(201).json(await getSalarySlip(id, slipId));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

async function loadAccount(req: Request, res: Response) {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Account not found." });
    return null;
  }
  const detail = await getAccount(id);
  if (!detail) {
    res.status(404).json({ error: "Account not found." });
    return null;
  }
  return detail;
}

function principal(res: Response) {
  return res.locals.principal as Principal;
}

function routeId(req: Request) {
  return routeKey(req, "id");
}

function routeKey(req: Request, key: string) {
  const value = req.params[key];
  return typeof value === "string" && idPattern.test(value) ? value : null;
}

function sendDenied(res: Response, error: unknown) {
  if (!(error instanceof FinanceDenied)) return false;
  res.status(error.status).json({ error: error.message });
  return true;
}
