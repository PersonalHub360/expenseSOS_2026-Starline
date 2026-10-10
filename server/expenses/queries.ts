import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { approvals, accounts, expenses, projects, vendorBills, vendorPayments, vendors } from "../db/schema";
import { addMoney, subtractMoney } from "../projects/money";
import { expenseTotal, pendingTotal, vendorOutstanding } from "./ledger";
import { countsTowardBill } from "./policy";
import { listAccounts } from "../finance/queries";

export type ExpenseFilters = {
  q: string;
  projectId: string;
  category: string;
  status: string;
  from: string;
  to: string;
};

export async function listExpenses(filters: ExpenseFilters) {
  const conditions = [];
  if (filters.projectId) conditions.push(eq(expenses.projectId, filters.projectId));
  if (filters.category) conditions.push(sql`lower(${expenses.category}) = ${filters.category.toLowerCase()}`);
  if (filters.status) conditions.push(eq(expenses.status, filters.status as typeof expenses.$inferSelect.status));
  if (filters.from) conditions.push(sql`(${expenses.spentAt} at time zone 'UTC')::date >= ${filters.from}::date`);
  if (filters.to) conditions.push(sql`(${expenses.spentAt} at time zone 'UTC')::date <= ${filters.to}::date`);
  if (filters.q) {
    const needle = `%${filters.q.replace(/[%_]/g, "")}%`;
    conditions.push(
      or(ilike(expenses.category, needle), ilike(expenses.description, needle), ilike(expenses.note, needle), ilike(vendors.name, needle)),
    );
  }

  const rows = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      category: expenses.category,
      description: expenses.description,
      note: expenses.note,
      method: expenses.method,
      status: expenses.status,
      frequency: expenses.frequency,
      nextDueDate: expenses.nextDueDate,
      spentAt: expenses.spentAt,
      receiptName: expenses.receiptName,
      requestedBy: expenses.requestedBy,
      projectId: projects.id,
      projectName: projects.name,
      vendorId: vendors.id,
      vendorName: vendors.name,
      accountId: accounts.id,
      accountName: accounts.name,
    })
    .from(expenses)
    .leftJoin(projects, eq(expenses.projectId, projects.id))
    .leftJoin(vendors, eq(expenses.vendorId, vendors.id))
    .leftJoin(accounts, eq(expenses.accountId, accounts.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt));

  return {
    expenses: rows.map(presentExpense),
    total: expenseTotal(rows),
    pending: pendingTotal(rows),
  };
}

export async function getExpense(id: string) {
  const [row] = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      category: expenses.category,
      description: expenses.description,
      note: expenses.note,
      method: expenses.method,
      status: expenses.status,
      frequency: expenses.frequency,
      nextDueDate: expenses.nextDueDate,
      spentAt: expenses.spentAt,
      receiptKey: expenses.receiptKey,
      receiptName: expenses.receiptName,
      receiptType: expenses.receiptType,
      receiptBytes: expenses.receiptBytes,
      requestedBy: expenses.requestedBy,
      decidedBy: expenses.decidedBy,
      decidedAt: expenses.decidedAt,
      decisionNote: expenses.decisionNote,
      projectId: projects.id,
      projectName: projects.name,
      vendorId: vendors.id,
      vendorName: vendors.name,
      accountId: accounts.id,
      accountName: accounts.name,
    })
    .from(expenses)
    .leftJoin(projects, eq(expenses.projectId, projects.id))
    .leftJoin(vendors, eq(expenses.vendorId, vendors.id))
    .leftJoin(accounts, eq(expenses.accountId, accounts.id))
    .where(eq(expenses.id, id))
    .limit(1);
  if (!row) return null;
  const [openApproval] = await db
    .select({ requestedBy: approvals.requestedBy })
    .from(approvals)
    .where(and(eq(approvals.subjectId, id), eq(approvals.status, "pending")))
    .limit(1);
  return {
    expense: {
      ...presentExpense(row),
      receiptType: row.receiptType,
      receiptBytes: row.receiptBytes,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
      hasReceipt: Boolean(row.receiptKey),
      approvalRequestedBy: openApproval?.requestedBy ?? row.requestedBy,
    },
  };
}

export async function expenseSummary() {
  const expenseRows = await db.select({ amount: expenses.amount, status: expenses.status }).from(expenses);
  const billRows = await db.select({ amount: vendorBills.amount, status: vendorBills.status }).from(vendorBills);
  const paymentRows = await db.select({ amount: vendorPayments.amount, status: vendorPayments.status }).from(vendorPayments);
  return {
    summary: {
      total: expenseTotal(expenseRows),
      pending: pendingTotal(expenseRows),
      vendorOutstanding: vendorOutstanding(billRows, paymentRows),
    },
  };
}

export async function expenseCatalog() {
  const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name));
  const vendorRows = await db
    .select({ id: vendors.id, name: vendors.name, kind: vendors.kind })
    .from(vendors)
    .orderBy(asc(vendors.name));
  const categoryRows = await db.selectDistinct({ category: expenses.category }).from(expenses).orderBy(asc(expenses.category));
  const { accounts: accountRows } = await listAccounts();
  return {
    projects: projectRows,
    vendors: vendorRows,
    categories: categoryRows.map((row) => row.category),
    accounts: accountRows
      .filter((account) => account.isActive)
      .map((account) => ({ id: account.id, name: account.name, kind: account.kind, balance: account.balance })),
  };
}

export async function listVendors() {
  const vendorRows = await db.select().from(vendors).orderBy(asc(vendors.name));
  const billRows = await db.select({ vendorId: vendorBills.vendorId, amount: vendorBills.amount, status: vendorBills.status }).from(vendorBills);
  const paymentRows = await db
    .select({ vendorId: vendorPayments.vendorId, amount: vendorPayments.amount, status: vendorPayments.status })
    .from(vendorPayments);
  return vendorRows.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    phone: vendor.phone,
    email: vendor.email,
    address: vendor.address,
    kind: vendor.kind,
    outstanding: vendorOutstanding(
      billRows.filter((bill) => bill.vendorId === vendor.id),
      paymentRows.filter((payment) => payment.vendorId === vendor.id),
    ),
    bills: billRows.filter((bill) => bill.vendorId === vendor.id && bill.status !== "rejected" && bill.status !== "void").length,
  }));
}

export async function getVendor(id: string) {
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  if (!vendor) return null;
  const billRows = await db
    .select({
      id: vendorBills.id,
      reference: vendorBills.reference,
      description: vendorBills.description,
      amount: vendorBills.amount,
      billDate: vendorBills.billDate,
      dueDate: vendorBills.dueDate,
      status: vendorBills.status,
      requestedBy: vendorBills.requestedBy,
      decisionNote: vendorBills.decisionNote,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(vendorBills)
    .leftJoin(projects, eq(vendorBills.projectId, projects.id))
    .where(eq(vendorBills.vendorId, id))
    .orderBy(desc(vendorBills.billDate), desc(vendorBills.createdAt));
  const paymentRows = await db
    .select({
      id: vendorPayments.id,
      billId: vendorPayments.billId,
      reference: vendorPayments.reference,
      amount: vendorPayments.amount,
      method: vendorPayments.method,
      note: vendorPayments.note,
      status: vendorPayments.status,
      paidAt: vendorPayments.paidAt,
      requestedBy: vendorPayments.requestedBy,
      decisionNote: vendorPayments.decisionNote,
    })
    .from(vendorPayments)
    .where(eq(vendorPayments.vendorId, id))
    .orderBy(desc(vendorPayments.paidAt), desc(vendorPayments.createdAt));

  const subjectIds = [...billRows.map((bill) => bill.id), ...paymentRows.map((payment) => payment.id)];
  const openApprovals = subjectIds.length
    ? await db
        .select({ subjectId: approvals.subjectId, requestedBy: approvals.requestedBy })
        .from(approvals)
        .where(and(inArray(approvals.subjectId, subjectIds), eq(approvals.status, "pending")))
    : [];
  const approvalOwner = new Map(openApprovals.map((row) => [row.subjectId, row.requestedBy]));

  const bills = billRows.map((bill) => {
    const posted = addMoney(
      paymentRows.filter((payment) => payment.billId === bill.id && payment.status === "posted").map((payment) => payment.amount),
    );
    return {
      id: bill.id,
      reference: bill.reference,
      description: bill.description,
      amount: bill.amount,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      status: bill.status,
      requestedBy: approvalOwner.get(bill.id) ?? bill.requestedBy,
      decisionNote: bill.decisionNote,
      outstanding: countsTowardBill(bill.status) ? subtractMoney(bill.amount, posted) : "0.00",
      project: bill.projectId ? { id: bill.projectId, name: bill.projectName ?? "" } : null,
    };
  });

  return {
    vendor: {
      id: vendor.id,
      name: vendor.name,
      phone: vendor.phone,
      email: vendor.email,
      address: vendor.address,
      notes: vendor.notes,
      kind: vendor.kind,
    },
    bills,
    payments: paymentRows.map((payment) => ({
      ...payment,
      requestedBy: approvalOwner.get(payment.id) ?? payment.requestedBy,
    })),
    outstanding: vendorOutstanding(billRows, paymentRows),
  };
}

export async function receiptFile(id: string) {
  const [row] = await db
    .select({
      receiptKey: expenses.receiptKey,
      receiptName: expenses.receiptName,
      receiptType: expenses.receiptType,
    })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!row?.receiptKey) return null;
  return {
    receiptKey: row.receiptKey,
    receiptName: row.receiptName,
    receiptType: row.receiptType,
  };
}

function presentExpense(row: {
  id: string;
  amount: string;
  category: string;
  description: string;
  note: string;
  method: string;
  status: string;
  frequency: string | null;
  nextDueDate: string | null;
  spentAt: Date;
  receiptName: string;
  requestedBy: string | null;
  projectId: string | null;
  projectName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  accountId: string | null;
  accountName: string | null;
}) {
  return {
    id: row.id,
    amount: row.amount,
    category: row.category,
    description: row.description || row.note,
    method: row.method,
    status: row.status,
    frequency: row.frequency,
    nextDueDate: row.nextDueDate,
    spentAt: row.spentAt,
    hasReceipt: Boolean(row.receiptName),
    requestedBy: row.requestedBy,
    project: row.projectId ? { id: row.projectId, name: row.projectName ?? "" } : null,
    vendor: row.vendorId ? { id: row.vendorId, name: row.vendorName ?? "" } : null,
    account: row.accountId ? { id: row.accountId, name: row.accountName ?? "" } : null,
  };
}
