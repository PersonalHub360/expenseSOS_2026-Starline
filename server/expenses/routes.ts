import { Router, type Request, type Response } from "express";
import { writeAudit } from "../audit/log";
import { eq } from "drizzle-orm";
import { requireAuth, requirePermission, type Principal } from "../auth/principal";
import { db } from "../db/client";
import { vendorBills } from "../db/schema";
import {
  attachReceipt,
  clearReceipt,
  createBill,
  createExpense,
  createVendor,
  decideBill,
  decideBillVoid,
  decideExpense,
  decideExpenseVoid,
  decideVendorPayment,
  deleteExpense,
  deleteVendor,
  OperationDenied,
  postNextExpense,
  recordVendorPayment,
  requestBillVoid,
  requestExpenseVoid,
  updateExpense,
  updateVendor,
} from "./commands";
import { readReceipt } from "./files";
import { expenseCatalog, expenseSummary, getExpense, getVendor, listExpenses, listVendors, receiptFile } from "./queries";
import { parseBill, parseDecision, parseExpenseFilters, parseExpenseInput, parseReceiptUpload, parseVendor, parseVendorPayment } from "./validate";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const expensesRouter = Router();
export const vendorsRouter = Router();

expensesRouter.use(requireAuth);
vendorsRouter.use(requireAuth);

expensesRouter.get("/summary", requirePermission("expenses", "view"), async (_req, res) => {
  res.json(await expenseSummary());
});

expensesRouter.get("/catalog", requirePermission("expenses", "view"), async (_req, res) => {
  res.json(await expenseCatalog());
});

expensesRouter.get("/", requirePermission("expenses", "view"), async (req, res) => {
  const parsed = parseExpenseFilters(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json(await listExpenses(parsed.value));
});

expensesRouter.post("/", requirePermission("expenses", "add"), async (req, res) => {
  const parsed = parseExpenseInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const id = await createExpense(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "expense", subjectId: id, summary: "Expense created" });
    res.status(201).json(await getExpense(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

expensesRouter.get("/:id/receipt", requirePermission("expenses", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  const file = await receiptFile(id);
  if (!file) {
    res.status(404).json({ error: "Receipt not found." });
    return;
  }
  const bytes = await readReceipt(file.receiptKey);
  res.setHeader("Content-Type", file.receiptType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${file.receiptName.replace(/["\r\n]/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(bytes);
});

expensesRouter.post("/:id/receipt", requirePermission("expenses", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  const parsed = parseReceiptUpload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await attachReceipt(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "expense", subjectId: id, summary: "Expense receipt stored" });
    res.json(await getExpense(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

expensesRouter.delete("/:id/receipt", requirePermission("expenses", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  try {
    await clearReceipt(principal(res), id);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "expense", subjectId: id, summary: "Expense receipt removed" });
    res.json(await getExpense(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

expensesRouter.get("/:id", requirePermission("expenses", "view"), async (req, res) => {
  const id = routeId(req);
  const detail = id ? await getExpense(id) : null;
  if (!detail) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  res.json(detail);
});

expensesRouter.patch("/:id", requirePermission("expenses", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  const parsed = parseExpenseInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await updateExpense(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "expense", subjectId: id, summary: "Expense updated" });
    res.json(await getExpense(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

expensesRouter.delete("/:id", requirePermission("expenses", "delete"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  try {
    await deleteExpense(principal(res), id);
    await writeAudit({ actorId: principal(res).id, action: "delete", subjectType: "expense", subjectId: id, summary: "Expense deleted" });
    res.json({ ok: true });
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

expensesRouter.post("/:id/decision", requirePermission("expenses", "edit"), async (req, res) => {
  await decide(req, res, (actor, id, decision, note) => decideExpense(actor, id, decision, note));
});

expensesRouter.post("/:id/void", requirePermission("expenses", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  const parsed = parseDecision(req.body ?? {});
  const note = parsed.ok ? parsed.value.note : "";
  try {
    await requestExpenseVoid(principal(res), id, note);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "expense", subjectId: id, summary: "Expense void requested" });
    res.json(await getExpense(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

expensesRouter.post("/:id/void-decision", requirePermission("expenses", "edit"), async (req, res) => {
  await decide(req, res, (actor, id, decision, note) => decideExpenseVoid(actor, id, decision, note));
});

expensesRouter.post("/:id/next", requirePermission("expenses", "add"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  try {
    const created = await postNextExpense(principal(res), id);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "expense", subjectId: created, summary: "Expense created" });
    res.status(201).json(await getExpense(created));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

vendorsRouter.get("/", requirePermission("vendors", "view"), async (_req, res) => {
  res.json({ vendors: await listVendors() });
});

vendorsRouter.post("/", requirePermission("vendors", "add"), async (req, res) => {
  const parsed = parseVendor(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const id = await createVendor(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "vendor", subjectId: id, summary: "Vendor created" });
    res.status(201).json(await getVendor(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

vendorsRouter.get("/:id", requirePermission("vendors", "view"), async (req, res) => {
  const id = routeId(req);
  const detail = id ? await getVendor(id) : null;
  if (!detail) {
    res.status(404).json({ error: "Vendor not found." });
    return;
  }
  res.json(detail);
});

vendorsRouter.patch("/:id", requirePermission("vendors", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Vendor not found." });
    return;
  }
  const parsed = parseVendor(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await updateVendor(principal(res), id, parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "vendor", subjectId: id, summary: "Vendor updated" });
    res.json(await getVendor(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

vendorsRouter.delete("/:id", requirePermission("vendors", "delete"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Vendor not found." });
    return;
  }
  try {
    await deleteVendor(principal(res), id);
    await writeAudit({ actorId: principal(res).id, action: "delete", subjectType: "vendor", subjectId: id, summary: "Vendor deleted" });
    res.json({ ok: true });
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

vendorsRouter.post("/:id/bills", requirePermission("vendors", "add"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Vendor not found." });
    return;
  }
  const parsed = parseBill({ ...(req.body as object), vendorId: id });
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await createBill(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "vendor_bill", subjectId: id, summary: "Vendor bill created" });
    res.status(201).json(await getVendor(id));
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

vendorsRouter.post("/bills/:id/decision", requirePermission("vendors", "edit"), async (req, res) => {
  await decide(req, res, async (actor, id, decision, note) => {
    await decideBill(actor, id, decision, note);
  }, "vendor", "vendor_bill");
});

vendorsRouter.post("/bills/:id/void", requirePermission("vendors", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Bill not found." });
    return;
  }
  const parsed = parseDecision({ decision: "approved", ...(req.body as object) });
  try {
    await requestBillVoid(principal(res), id, parsed.ok ? parsed.value.note : "");
    await writeAudit({ actorId: principal(res).id, action: "update", subjectType: "vendor_bill", subjectId: id, summary: "Vendor bill void requested" });
    res.json({ ok: true });
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

vendorsRouter.post("/bills/:id/void-decision", requirePermission("vendors", "edit"), async (req, res) => {
  await decide(req, res, async (actor, id, decision, note) => {
    await decideBillVoid(actor, id, decision, note);
  }, "expense", "vendor_bill");
});

vendorsRouter.post("/bills/:id/payments", requirePermission("vendors", "add"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Bill not found." });
    return;
  }
  const parsed = parseVendorPayment({ ...(req.body as object), billId: id });
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await recordVendorPayment(principal(res), parsed.value);
    await writeAudit({ actorId: principal(res).id, action: "create", subjectType: "vendor_payment", subjectId: id, summary: "Vendor payment recorded" });
    const detail = await vendorOfBill(id);
    res.status(201).json(detail);
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
});

vendorsRouter.post("/payments/:id/decision", requirePermission("vendors", "edit"), async (req, res) => {
  await decide(req, res, async (actor, id, decision, note) => {
    await decideVendorPayment(actor, id, decision, note);
  }, "expense", "vendor_payment");
});

async function decide(
  req: Request,
  res: Response,
  run: (actor: Principal, id: string, decision: "approved" | "rejected", note: string) => Promise<void>,
  reload: "expense" | "vendor" = "expense",
  subjectType = "expense",
) {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Record not found." });
    return;
  }
  const parsed = parseDecision(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    await run(principal(res), id, parsed.value.decision, parsed.value.note);
    await writeAudit({
      actorId: principal(res).id,
      action: "approve",
      subjectType,
      subjectId: id,
      summary: parsed.value.decision === "approved" ? "Approval granted" : "Approval rejected",
    });
    if (reload === "expense") res.json(await getExpense(id));
    else res.json({ ok: true });
  } catch (error) {
    if (!sendDenied(res, error)) throw error;
  }
}

async function vendorOfBill(billId: string) {
  const [bill] = await db.select({ vendorId: vendorBills.vendorId }).from(vendorBills).where(eq(vendorBills.id, billId)).limit(1);
  if (!bill) return { ok: true };
  return getVendor(bill.vendorId);
}

function principal(res: Response) {
  return res.locals.principal as Principal;
}

function routeId(req: Request) {
  const id = req.params.id;
  const value = Array.isArray(id) ? id[0] : id;
  return value && idPattern.test(value) ? value : "";
}

function sendDenied(res: Response, error: unknown) {
  if (error instanceof OperationDenied) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  if (pgCode(error) === "23505") {
    res.status(409).json({ error: "This is already waiting for approval." });
    return true;
  }
  if (pgCode(error) === "23503") {
    res.status(400).json({ error: "Choose a project or vendor that exists." });
    return true;
  }
  return false;
}

function pgCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}
