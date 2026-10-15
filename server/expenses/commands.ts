import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Principal } from "../auth/principal";
import { allows, type AppModule, type PermissionAction } from "../access";
import { db } from "../db/client";
import { approvals, accountTransactions, accounts, expenseCategories, expenses, projects, purchaseTypes, vendorBills, vendorPayments, vendors } from "../db/schema";
import { advanceDate } from "./dates";
import { inspectReceipt, removeReceipt, storeReceipt } from "./files";
import { accountBalance } from "../finance/ledger";
import { amountAvailable, withinRemaining } from "./ledger";
import { needsApproval } from "./policy";
import { compareMoney } from "../projects/money";
import { expenseMethod, parseExpenseInput, type ExpenseImportRow } from "./validate";

type Subject = "expense" | "expense_void" | "vendor_bill" | "vendor_bill_void" | "vendor_payment";
type Frequency = "monthly" | "quarterly" | "yearly";

export class OperationDenied extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type ExpenseDraft = {
  projectId: string | null;
  vendorId: string | null;
  category: string;
  description: string;
  note?: string;
  amount: string;
  method: string;
  accountId: string | null;
  spentOn: string;
  frequency: Frequency | null;
  nextDueDate: string | null;
};

export type VendorDraft = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  kind: "supplier" | "contractor";
};

export type BillDraft = {
  vendorId: string;
  projectId: string | null;
  description: string;
  amount: string;
  billDate: string;
  dueDate: string;
};

export type VendorPaymentDraft = {
  billId: string;
  amount: string;
  method: string;
  accountId: string | null;
  note: string;
  paidOn: string | null;
};

export async function createVendor(principal: Principal, draft: VendorDraft) {
  requireAction(principal, "vendors", "add");
  const [created] = await db.insert(vendors).values(draft).returning({ id: vendors.id });
  if (!created) throw new Error("Vendor was not stored.");
  return created.id;
}

export async function updateVendor(principal: Principal, id: string, draft: VendorDraft) {
  requireAction(principal, "vendors", "edit");
  const [updated] = await db.update(vendors).set({ ...draft, updatedAt: new Date() }).where(eq(vendors.id, id)).returning({ id: vendors.id });
  if (!updated) throw new OperationDenied("Vendor not found.", 404);
  return updated.id;
}

export async function deleteVendor(principal: Principal, id: string) {
  requireAction(principal, "vendors", "delete");
  const [bill] = await db.select({ id: vendorBills.id }).from(vendorBills).where(eq(vendorBills.vendorId, id)).limit(1);
  const [expense] = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.vendorId, id)).limit(1);
  if (bill || expense) throw new OperationDenied("This vendor has bills or expenses and cannot be removed.", 409);
  const [removed] = await db.delete(vendors).where(eq(vendors.id, id)).returning({ id: vendors.id });
  if (!removed) throw new OperationDenied("Vendor not found.", 404);
}

export async function createExpense(principal: Principal, draft: ExpenseDraft) {
  requireAction(principal, "expenses", "add");
  return db.transaction(async (tx) => {
    await assertLinks(tx, draft.projectId, draft.vendorId);
    const pending = needsApproval(draft.amount);
    const [created] = await tx
      .insert(expenses)
      .values({
        projectId: draft.projectId,
        vendorId: draft.vendorId,
        amount: draft.amount,
        category: draft.category,
        description: draft.description,
        note: draft.note ?? draft.description,
        method: draft.method,
        accountId: draft.accountId,
        status: pending ? "pending" : "approved",
        frequency: draft.frequency,
        nextDueDate: draft.nextDueDate,
        spentAt: spentAt(draft.spentOn),
        requestedBy: principal.id,
      })
      .returning({ id: expenses.id });
    if (!created) throw new Error("Expense was not stored.");
    if (pending) await openApproval(tx, "expense", created.id, draft.amount, principal.id);
    else {
      await chargeAccount(tx, {
        accountId: draft.accountId,
        sourceId: created.id,
        amount: draft.amount,
        note: expenseNote(draft.category, draft.description),
        occurredAt: spentAt(draft.spentOn),
        expense: true,
      });
    }
    return created.id;
  });
}

export async function addExpenseCategory(principal: Principal, name: string) {
  requireAction(principal, "expenses", "add");
  const trimmed = name.trim();
  const [existing] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(sql`lower(${expenseCategories.name}) = ${trimmed.toLowerCase()}`)
    .limit(1);
  if (existing) throw new OperationDenied("This category is already saved.", 409);
  const [created] = await db.insert(expenseCategories).values({ name: trimmed }).returning({ id: expenseCategories.id });
  if (!created) throw new Error("Category was not stored.");
  return created.id;
}

export async function addPurchaseType(principal: Principal, name: string) {
  requireAction(principal, "expenses", "add");
  const trimmed = name.trim();
  const [existing] = await db
    .select({ id: purchaseTypes.id })
    .from(purchaseTypes)
    .where(sql`lower(${purchaseTypes.name}) = ${trimmed.toLowerCase()}`)
    .limit(1);
  if (existing) throw new OperationDenied("This purchase type is already saved.", 409);
  const [created] = await db.insert(purchaseTypes).values({ name: trimmed }).returning({ id: purchaseTypes.id });
  if (!created) throw new Error("Purchase type was not stored.");
  return created.id;
}

export async function renamePurchaseType(principal: Principal, id: string, name: string) {
  requireAction(principal, "expenses", "edit");
  const trimmed = name.trim();
  const [row] = await db.select({ id: purchaseTypes.id, name: purchaseTypes.name }).from(purchaseTypes).where(eq(purchaseTypes.id, id)).limit(1);
  if (!row) throw new OperationDenied("Purchase type not found.", 404);
  if (row.name.toLowerCase() === trimmed.toLowerCase()) {
    if (row.name !== trimmed) await db.update(purchaseTypes).set({ name: trimmed }).where(eq(purchaseTypes.id, id));
    return;
  }
  const [taken] = await db
    .select({ id: purchaseTypes.id })
    .from(purchaseTypes)
    .where(sql`lower(${purchaseTypes.name}) = ${trimmed.toLowerCase()}`)
    .limit(1);
  if (taken) throw new OperationDenied("This purchase type is already saved.", 409);
  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ category: trimmed }).where(sql`lower(${expenses.category}) = ${row.name.toLowerCase()}`);
    await tx.update(purchaseTypes).set({ name: trimmed }).where(eq(purchaseTypes.id, id));
  });
}

export async function removeExpenseCategory(principal: Principal, id: string) {
  requireAction(principal, "expenses", "edit");
  const [row] = await db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(eq(expenseCategories.id, id)).limit(1);
  if (!row) throw new OperationDenied("Category not found.", 404);
  const [used] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(sql`lower(${expenses.category}) = ${row.name.toLowerCase()}`)
    .limit(1);
  if (used) throw new OperationDenied("This category is used by an expense and cannot be removed.", 409);
  await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
}

export async function importExpenses(principal: Principal, rows: ExpenseImportRow[]) {
  requireAction(principal, "expenses", "add");
  const accountRows = await db.select({ id: accounts.id, name: accounts.name, isActive: accounts.isActive }).from(accounts);
  const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects);
  const ready: { line: number; draft: ExpenseDraft }[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const method = expenseMethod(row.method);
    const accountName = row.account.trim();
    const accountMatches = accountName ? named(accountRows, accountName).filter((account) => account.isActive) : [];
    const projectName = row.project.trim();
    const projectMatches = projectName ? named(projectRows, projectName) : [];
    const parsed = parseExpenseInput({
      category: row.category,
      description: row.description,
      amount: row.amount,
      method: method ?? "cash",
      accountId: accountMatches.length === 1 ? accountMatches[0].id : undefined,
      projectId: projectMatches.length === 1 ? projectMatches[0].id : undefined,
      spentOn: row.date.trim(),
      frequency: null,
      nextDueDate: "",
    });
    if (!accountName) errors.push(`Row ${row.line}: Enter the cash or bank account.`);
    else if (named(accountRows, accountName).length === 0) errors.push(`Row ${row.line}: No account is named ${accountName}.`);
    else if (accountMatches.length === 0) errors.push(`Row ${row.line}: Choose an active cash or bank account.`);
    else if (accountMatches.length > 1) errors.push(`Row ${row.line}: More than one account uses that name.`);
    if (projectName && projectMatches.length === 0) errors.push(`Row ${row.line}: No project is named ${projectName}.`);
    else if (projectMatches.length > 1) errors.push(`Row ${row.line}: More than one project uses that name.`);
    if (!method) errors.push(`Row ${row.line}: Use cash, bank, bkash, nagad, or cheque.`);
    if (!parsed.ok) errors.push(`Row ${row.line}: ${parsed.error}`);
    else if (method && accountMatches.length === 1 && (!projectName || projectMatches.length === 1)) ready.push({ line: row.line, draft: parsed.value });
  }
  if (errors.length) {
    const extra = errors.length > 6 ? ` ${errors.length - 6} more rows need attention.` : "";
    throw new OperationDenied(`${errors.slice(0, 6).join(" ")}${extra}`, 400);
  }

  let pending = 0;
  const ids: string[] = [];
  for (const row of ready) {
    try {
      row.draft.category = await canonicalCategory(row.draft.category);
      ids.push(await createExpense(principal, row.draft));
      if (needsApproval(row.draft.amount)) pending += 1;
    } catch (error) {
      if (error instanceof OperationDenied) {
        const saved = ids.length === 0 ? "" : `${ids.length} saved. `;
        throw new OperationDenied(`${saved}Row ${row.line}: ${error.message}`, error.status);
      }
      throw error;
    }
  }
  return { created: ids.length, pending, ids };
}

export async function updateExpense(principal: Principal, id: string, draft: ExpenseDraft) {
  requireAction(principal, "expenses", "edit");
  return db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    if (current.status !== "pending" && current.status !== "rejected") {
      throw new OperationDenied("Only a pending or rejected expense can be changed.", 409);
    }
    await assertLinks(tx, draft.projectId, draft.vendorId);
    const pending = needsApproval(draft.amount);
    await tx
      .update(expenses)
      .set({
        projectId: draft.projectId,
        vendorId: draft.vendorId,
        amount: draft.amount,
        category: draft.category,
        description: draft.description,
        note: draft.description,
        method: draft.method,
        accountId: draft.accountId,
        status: pending ? "pending" : "approved",
        frequency: draft.frequency,
        nextDueDate: draft.nextDueDate,
        spentAt: spentAt(draft.spentOn),
        requestedBy: principal.id,
        decidedBy: pending ? null : principal.id,
        decidedAt: pending ? null : new Date(),
        decisionNote: pending ? "" : "Amount is below the approval threshold.",
      })
      .where(eq(expenses.id, id));
    if (pending) {
      const open = await pendingApproval(tx, "expense", id);
      if (open) {
        await tx.update(approvals).set({ amount: draft.amount, requestedBy: principal.id }).where(eq(approvals.id, open.id));
      } else {
        await openApproval(tx, "expense", id, draft.amount, principal.id);
      }
    } else {
      await settleOpen(tx, "expense", id, principal.id, "approved", "Amount is below the approval threshold.");
      await chargeAccount(tx, {
        accountId: draft.accountId,
        sourceId: id,
        amount: draft.amount,
        note: expenseNote(draft.category, draft.description),
        occurredAt: spentAt(draft.spentOn),
        expense: true,
      });
    }
    return id;
  });
}

export async function deleteExpense(principal: Principal, id: string) {
  requireAction(principal, "expenses", "delete");
  const removed = await db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    if (current.status !== "pending" && current.status !== "rejected") {
      throw new OperationDenied("Recorded expenses have to be voided. They cannot be deleted.", 409);
    }
    await tx.delete(approvals).where(and(eq(approvals.subjectType, "expense"), eq(approvals.subjectId, id)));
    await tx.delete(expenses).where(eq(expenses.id, id));
    return current.receiptKey;
  });
  await removeReceipt(removed);
}

export async function decideExpense(principal: Principal, id: string, decision: "approved" | "rejected", note: string) {
  requireAction(principal, "expenses", "edit");
  await db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    if (current.status !== "pending") throw new OperationDenied("This expense is not waiting for approval.", 409);
    if (decision === "approved") {
      await chargeAccount(tx, {
        accountId: current.accountId,
        sourceId: current.id,
        amount: current.amount,
        note: expenseNote(current.category, current.description),
        occurredAt: current.spentAt,
        expense: true,
      });
    }
    await settleOwned(tx, principal, "expense", id, decision, note);
    await tx
      .update(expenses)
      .set({ status: decision, decidedBy: principal.id, decidedAt: new Date(), decisionNote: note })
      .where(eq(expenses.id, id));
  });
}

export async function requestExpenseVoid(principal: Principal, id: string, note: string) {
  requireAction(principal, "expenses", "edit");
  await db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    if (current.status !== "approved") throw new OperationDenied("Only a recorded expense can be voided.", 409);
    await tx.update(expenses).set({ status: "void_pending", decisionNote: note }).where(eq(expenses.id, id));
    await openApproval(tx, "expense_void", id, current.amount, principal.id, note);
  });
}

export async function decideExpenseVoid(principal: Principal, id: string, decision: "approved" | "rejected", note: string) {
  requireAction(principal, "expenses", "edit");
  await db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    if (current.status !== "void_pending") throw new OperationDenied("This expense is not waiting to be voided.", 409);
    if (decision === "approved") await restoreExpense(tx, current);
    await settleOwned(tx, principal, "expense_void", id, decision, note);
    await tx
      .update(expenses)
      .set({
        status: decision === "approved" ? "void" : "approved",
        decidedBy: principal.id,
        decidedAt: new Date(),
        decisionNote: note,
      })
      .where(eq(expenses.id, id));
  });
}

export async function postNextExpense(principal: Principal, id: string) {
  requireAction(principal, "expenses", "add");
  return db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    if (current.status !== "approved" || !current.frequency || !current.nextDueDate) {
      throw new OperationDenied("Only an approved recurring expense can post the next due date.", 409);
    }
    const pending = needsApproval(current.amount);
    const [created] = await tx
      .insert(expenses)
      .values({
        projectId: current.projectId,
        vendorId: current.vendorId,
        amount: current.amount,
        category: current.category,
        description: current.description,
        note: current.note,
        method: current.method,
        accountId: current.accountId,
        status: pending ? "pending" : "approved",
        spentAt: spentAt(current.nextDueDate),
        requestedBy: principal.id,
      })
      .returning({ id: expenses.id });
    if (!created) throw new Error("The next expense was not stored.");
    if (pending) await openApproval(tx, "expense", created.id, current.amount, principal.id);
    else {
      await chargeAccount(tx, {
        accountId: current.accountId,
        sourceId: created.id,
        amount: current.amount,
        note: expenseNote(current.category, current.description),
        occurredAt: spentAt(current.nextDueDate),
        expense: true,
      });
    }
    await tx
      .update(expenses)
      .set({ nextDueDate: advanceDate(current.nextDueDate, current.frequency) })
      .where(eq(expenses.id, id));
    return created.id;
  });
}

export async function attachReceipt(
  principal: Principal,
  id: string,
  file: { fileName: string; contentType: string; data: string },
) {
  requireAction(principal, "expenses", "edit");
  const inspected = inspectReceipt(file);
  if (!inspected.ok) throw new OperationDenied(inspected.error, 400);
  const [current] = await db
    .select({ status: expenses.status, receiptKey: expenses.receiptKey })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!current) throw new OperationDenied("Expense not found.", 404);
  if (current.status === "void" || current.status === "rejected") {
    throw new OperationDenied("A receipt can be attached to a recorded or pending expense.", 409);
  }
  const key = await storeReceipt(inspected.value.bytes, inspected.value.extension);
  try {
    await db
      .update(expenses)
      .set({
        receiptKey: key,
        receiptName: inspected.value.fileName,
        receiptType: inspected.value.contentType,
        receiptBytes: inspected.value.bytes.length,
      })
      .where(eq(expenses.id, id));
  } catch (error) {
    await removeReceipt(key);
    throw error;
  }
  await removeReceipt(current.receiptKey);
}

export async function clearReceipt(principal: Principal, id: string) {
  requireAction(principal, "expenses", "edit");
  const [current] = await db
    .select({ receiptKey: expenses.receiptKey })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!current) throw new OperationDenied("Expense not found.", 404);
  await db
    .update(expenses)
    .set({ receiptKey: null, receiptName: "", receiptType: "", receiptBytes: null })
    .where(eq(expenses.id, id));
  await removeReceipt(current.receiptKey);
}

export async function createBill(principal: Principal, draft: BillDraft) {
  requireAction(principal, "vendors", "add");
  return db.transaction(async (tx) => {
    await assertLinks(tx, draft.projectId, draft.vendorId);
    const pending = needsApproval(draft.amount);
    const [created] = await tx
      .insert(vendorBills)
      .values({
        vendorId: draft.vendorId,
        projectId: draft.projectId,
        reference: documentCode("BL"),
        description: draft.description,
        amount: draft.amount,
        billDate: draft.billDate,
        dueDate: draft.dueDate,
        status: pending ? "pending" : "open",
        requestedBy: principal.id,
      })
      .returning({ id: vendorBills.id });
    if (!created) throw new Error("Bill was not stored.");
    if (pending) await openApproval(tx, "vendor_bill", created.id, draft.amount, principal.id);
    return created.id;
  });
}

export async function decideBill(principal: Principal, id: string, decision: "approved" | "rejected", note: string) {
  requireAction(principal, "vendors", "edit");
  await db.transaction(async (tx) => {
    const current = await lockBill(tx, id);
    if (current.status !== "pending") throw new OperationDenied("This bill is not waiting for approval.", 409);
    await settleOwned(tx, principal, "vendor_bill", id, decision, note);
    await tx
      .update(vendorBills)
      .set({
        status: decision === "approved" ? "open" : "rejected",
        decidedBy: principal.id,
        decidedAt: new Date(),
        decisionNote: note,
        updatedAt: new Date(),
      })
      .where(eq(vendorBills.id, id));
  });
}

export async function requestBillVoid(principal: Principal, id: string, note: string) {
  requireAction(principal, "vendors", "edit");
  await db.transaction(async (tx) => {
    const current = await lockBill(tx, id);
    if (current.status !== "open") throw new OperationDenied("Only an open bill can be voided.", 409);
    const posted = await tx
      .select({ id: vendorPayments.id })
      .from(vendorPayments)
      .where(and(eq(vendorPayments.billId, id), eq(vendorPayments.status, "posted")))
      .limit(1);
    if (posted.length) throw new OperationDenied("A bill with posted payments cannot be voided.", 409);
    await tx.update(vendorBills).set({ status: "void_pending", decisionNote: note, updatedAt: new Date() }).where(eq(vendorBills.id, id));
    await openApproval(tx, "vendor_bill_void", id, current.amount, principal.id, note);
  });
}

export async function decideBillVoid(principal: Principal, id: string, decision: "approved" | "rejected", note: string) {
  requireAction(principal, "vendors", "edit");
  await db.transaction(async (tx) => {
    const current = await lockBill(tx, id);
    if (current.status !== "void_pending") throw new OperationDenied("This bill is not waiting to be voided.", 409);
    await settleOwned(tx, principal, "vendor_bill_void", id, decision, note);
    await tx
      .update(vendorBills)
      .set({
        status: decision === "approved" ? "void" : "open",
        decidedBy: principal.id,
        decidedAt: new Date(),
        decisionNote: note,
        updatedAt: new Date(),
      })
      .where(eq(vendorBills.id, id));
    if (decision === "approved") {
      const waiting = await tx
        .select({ id: vendorPayments.id })
        .from(vendorPayments)
        .where(and(eq(vendorPayments.billId, id), eq(vendorPayments.status, "pending")));
      for (const payment of waiting) {
        await settleOpen(tx, "vendor_payment", payment.id, principal.id, "rejected", "The bill was voided.");
        await tx
          .update(vendorPayments)
          .set({ status: "rejected", decidedBy: principal.id, decidedAt: new Date(), decisionNote: "The bill was voided." })
          .where(eq(vendorPayments.id, payment.id));
      }
    }
  });
}

export async function recordVendorPayment(principal: Principal, draft: VendorPaymentDraft) {
  requireAction(principal, "vendors", "add");
  return db.transaction(async (tx) => {
    const bill = await lockBill(tx, draft.billId);
    if (bill.status !== "open") throw new OperationDenied("Payments can be recorded against an open bill.", 409);
    const reserved = await tx
      .select({ amount: vendorPayments.amount, status: vendorPayments.status })
      .from(vendorPayments)
      .where(eq(vendorPayments.billId, bill.id));
    const remaining = amountAvailable(
      bill.amount,
      reserved.filter((row) => row.status === "posted" || row.status === "pending").map((row) => row.amount),
    );
    if (!withinRemaining(draft.amount, remaining)) {
      throw new OperationDenied("Payment is more than the amount still open on this bill.", 400);
    }
    const pending = needsApproval(draft.amount);
    const reference = documentCode("VP");
    const [created] = await tx
      .insert(vendorPayments)
      .values({
        vendorId: bill.vendorId,
        billId: bill.id,
        reference,
        amount: draft.amount,
        method: draft.method,
        accountId: draft.accountId,
        note: draft.note,
        status: pending ? "pending" : "posted",
        paidAt: draft.paidOn ? spentAt(draft.paidOn) : new Date(),
        requestedBy: principal.id,
      })
      .returning({ id: vendorPayments.id });
    if (!created) throw new Error("Vendor payment was not stored.");
    if (pending) await openApproval(tx, "vendor_payment", created.id, draft.amount, principal.id);
    else {
      await chargeAccount(tx, {
        accountId: draft.accountId,
        sourceId: created.id,
        amount: draft.amount,
        note: `Purchase · ${reference}`,
        occurredAt: draft.paidOn ? spentAt(draft.paidOn) : new Date(),
        expense: false,
      });
    }
    return created.id;
  });
}

export async function decideVendorPayment(principal: Principal, id: string, decision: "approved" | "rejected", note: string) {
  requireAction(principal, "vendors", "edit");
  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(vendorPayments).where(eq(vendorPayments.id, id)).limit(1);
    if (!payment) throw new OperationDenied("Payment not found.", 404);
    await tx.execute(sql`select id from vendor_payments where id = ${id} for update`);
    await tx.execute(sql`select id from vendor_bills where id = ${payment.billId} for update`);
    if (payment.status !== "pending") throw new OperationDenied("This payment is not waiting for approval.", 409);
    if (decision === "approved") {
      const bill = await lockBill(tx, payment.billId);
      if (bill.status !== "open" && bill.status !== "void_pending") {
        throw new OperationDenied("This bill can no longer take the payment.", 409);
      }
      const reserved = await tx
        .select({ id: vendorPayments.id, amount: vendorPayments.amount, status: vendorPayments.status })
        .from(vendorPayments)
        .where(eq(vendorPayments.billId, payment.billId));
      const remaining = amountAvailable(
        bill.amount,
        reserved
          .filter((row) => row.id !== payment.id && (row.status === "posted" || row.status === "pending"))
          .map((row) => row.amount),
      );
      if (!withinRemaining(payment.amount, remaining)) {
        throw new OperationDenied("Payment is more than the amount still open on this bill.", 400);
      }
      await chargeAccount(tx, {
        accountId: payment.accountId,
        sourceId: payment.id,
        amount: payment.amount,
        note: `Purchase · ${payment.reference}`,
        occurredAt: payment.paidAt,
        expense: false,
      });
    }
    await settleOwned(tx, principal, "vendor_payment", id, decision, note);
    await tx
      .update(vendorPayments)
      .set({
        status: decision === "approved" ? "posted" : "rejected",
        decidedBy: principal.id,
        decidedAt: new Date(),
        decisionNote: note,
      })
      .where(eq(vendorPayments.id, id));
  });
}

function requireAction(principal: Principal, module: AppModule, action: PermissionAction) {
  const permission = principal.permissions.find((item) => item.module === module);
  if (!allows(permission, action)) throw new OperationDenied("You do not have access to this action", 403);
}

async function assertLinks(tx: Tx, projectId: string | null, vendorId: string | null) {
  if (projectId) {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new OperationDenied("Choose a project that exists.", 400);
  }
  if (vendorId) {
    const [vendor] = await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId)).limit(1);
    if (!vendor) throw new OperationDenied("Choose a vendor that exists.", 400);
  }
}

async function lockExpense(tx: Tx, id: string) {
  await tx.execute(sql`select id from expenses where id = ${id} for update`);
  const [row] = await tx.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) throw new OperationDenied("Expense not found.", 404);
  return row;
}

async function lockBill(tx: Tx, id: string) {
  await tx.execute(sql`select id from vendor_bills where id = ${id} for update`);
  const [row] = await tx.select().from(vendorBills).where(eq(vendorBills.id, id)).limit(1);
  if (!row) throw new OperationDenied("Bill not found.", 404);
  return row;
}

async function pendingApproval(tx: Tx, subject: Subject, subjectId: string) {
  const [row] = await tx
    .select()
    .from(approvals)
    .where(and(eq(approvals.subjectType, subject), eq(approvals.subjectId, subjectId), eq(approvals.status, "pending")))
    .limit(1);
  return row ?? null;
}

async function openApproval(tx: Tx, subject: Subject, subjectId: string, amount: string, requestedBy: string, note = "") {
  await tx.insert(approvals).values({ subjectType: subject, subjectId, amount, requestedBy, note });
}

async function settleOwned(
  tx: Tx,
  principal: Principal,
  subject: Subject,
  subjectId: string,
  decision: "approved" | "rejected",
  note: string,
) {
  const open = await pendingApproval(tx, subject, subjectId);
  if (!open) throw new OperationDenied("This request is not waiting for approval.", 409);
  if (open.requestedBy === principal.id) throw new OperationDenied("You cannot approve your own request.", 403);
  await tx
    .update(approvals)
    .set({ status: decision, decidedBy: principal.id, decidedAt: new Date(), note })
    .where(eq(approvals.id, open.id));
}

async function settleOpen(
  tx: Tx,
  subject: Subject,
  subjectId: string,
  actorId: string,
  decision: "approved" | "rejected",
  note: string,
) {
  const open = await pendingApproval(tx, subject, subjectId);
  if (!open) return;
  await tx
    .update(approvals)
    .set({ status: decision, decidedBy: actorId, decidedAt: new Date(), note })
    .where(eq(approvals.id, open.id));
}

function named<T extends { name: string }>(rows: T[], name: string) {
  const needle = name.trim().toLowerCase();
  return rows.filter((row) => row.name.trim().toLowerCase() === needle);
}

async function canonicalCategory(name: string) {
  const trimmed = name.trim();
  const [existing] = await db
    .select({ name: expenseCategories.name })
    .from(expenseCategories)
    .where(sql`lower(${expenseCategories.name}) = ${trimmed.toLowerCase()}`)
    .limit(1);
  if (existing) return existing.name;
  const [created] = await db.insert(expenseCategories).values({ name: trimmed }).returning({ name: expenseCategories.name });
  return created?.name ?? trimmed;
}

function spentAt(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function expenseNote(category: string, description: string) {
  const detail = description.trim();
  return detail ? `Expense · ${category} · ${detail}` : `Expense · ${category}`;
}

async function chargeAccount(
  tx: Tx,
  input: {
    accountId: string | null;
    sourceId: string;
    amount: string;
    note: string;
    occurredAt: Date;
    expense: boolean;
  },
) {
  if (!input.accountId) return;
  await tx.execute(sql`select id from accounts where id = ${input.accountId} for update`);
  const [account] = await tx
    .select({ id: accounts.id, isActive: accounts.isActive })
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .limit(1);
  if (!account || !account.isActive) throw new OperationDenied("Choose an active cash or bank account.", 400);
  const source = input.expense ? eq(accountTransactions.expenseId, input.sourceId) : eq(accountTransactions.vendorPaymentId, input.sourceId);
  const [already] = await tx
    .select({ id: accountTransactions.id })
    .from(accountTransactions)
    .where(and(source, eq(accountTransactions.kind, "withdrawal")))
    .limit(1);
  if (already) return;
  const rows = await tx
    .select({ kind: accountTransactions.kind, amount: accountTransactions.amount })
    .from(accountTransactions)
    .where(eq(accountTransactions.accountId, input.accountId));
  if (compareMoney(input.amount, accountBalance(rows)) > 0) {
    throw new OperationDenied("This account does not have enough balance.", 400);
  }
  await tx.insert(accountTransactions).values({
    accountId: input.accountId,
    kind: "withdrawal",
    amount: input.amount,
    note: input.note.slice(0, 500),
    occurredAt: input.occurredAt,
    expenseId: input.expense ? input.sourceId : null,
    vendorPaymentId: input.expense ? null : input.sourceId,
  });
}

async function restoreExpense(tx: Tx, expense: { id: string; category: string }) {
  const [withdrawal] = await tx
    .select({
      accountId: accountTransactions.accountId,
      amount: accountTransactions.amount,
    })
    .from(accountTransactions)
    .where(and(eq(accountTransactions.expenseId, expense.id), eq(accountTransactions.kind, "withdrawal")))
    .limit(1);
  if (!withdrawal) return;
  const [restored] = await tx
    .select({ id: accountTransactions.id })
    .from(accountTransactions)
    .where(and(eq(accountTransactions.expenseId, expense.id), eq(accountTransactions.kind, "deposit")))
    .limit(1);
  if (restored) return;
  await tx.execute(sql`select id from accounts where id = ${withdrawal.accountId} for update`);
  await tx.insert(accountTransactions).values({
    accountId: withdrawal.accountId,
    kind: "deposit",
    amount: withdrawal.amount,
    note: `Expense voided · ${expense.category}`.slice(0, 500),
    occurredAt: new Date(),
    expenseId: expense.id,
  });
}

function documentCode(prefix: string) {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${day}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
