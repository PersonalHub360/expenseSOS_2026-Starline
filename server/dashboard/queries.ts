import { desc, eq, inArray } from "drizzle-orm";
import type { Principal } from "../auth/principal";
import { db } from "../db/client";
import {
  approvals,
  buyers,
  expenses,
  installments,
  paymentAllocations,
  payments,
  projects,
  refunds,
  sales,
} from "../db/schema";
import { todayUtc } from "../expenses/dates";
import { countsTowardCost } from "../expenses/policy";
import { listAccounts, listInvestments } from "../finance/queries";
import { addMoney, subtractMoney } from "../projects/money";
import { installmentPosition } from "../sales/ledger";
import { listSales } from "../sales/queries";
import { deadlineKind, stillDue, type DeadlineKind } from "./deadlines";
import { buyerDues, inRange, monthlySeries, periodTotals, utcDay } from "./ledger";

export type DashboardNotice = {
  id: string;
  kind: "overdue" | "upcoming" | "approval";
  title: string;
  detail: string;
  at: string;
  href: string;
  amount: string;
};

const approvalTitles: Record<string, string> = {
  expense: "Expense awaiting approval",
  expense_void: "Expense void awaiting approval",
};

export async function dashboardReport(range: { from: string | null; to: string | null }, principal: Principal) {
  const [saleRows, paymentRows, refundRows, expenseRows, investmentList, accountList, projectRows, notifications] =
    await Promise.all([
      listSales(),
      db.select({ amount: payments.amount, paidAt: payments.paidAt }).from(payments),
      db.select({ amount: refunds.amount, refundedAt: refunds.refundedAt }).from(refunds),
      db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          status: expenses.status,
          category: expenses.category,
          description: expenses.description,
          projectId: expenses.projectId,
          nextDueDate: expenses.nextDueDate,
          spentAt: expenses.spentAt,
        })
        .from(expenses),
      listInvestments(),
      listAccounts(),
      db
        .select({
          id: projects.id,
          name: projects.name,
          budget: projects.budget,
          status: projects.status,
          startDate: projects.startDate,
        })
        .from(projects)
        .orderBy(projects.name),
      listNotifications(principal),
    ]);

  const datedExpenses = expenseRows.map((row) => ({
    amount: row.amount,
    status: row.status,
    projectId: row.projectId,
    on: utcDay(row.spentAt),
  }));
  const period = periodTotals({
    sales: saleRows.map((sale) => ({ amount: sale.net, status: sale.status, on: utcDay(sale.soldAt) })),
    payments: paymentRows.map((row) => ({ amount: row.amount, on: utcDay(row.paidAt) })),
    refunds: refundRows.map((row) => ({ amount: row.amount, on: utcDay(row.refundedAt) })),
    expenses: datedExpenses,
    investments: investmentList.investments.map((row) => ({ amount: row.amount, on: utcDay(row.investedAt) })),
    from: range.from,
    to: range.to,
  });
  const months = monthlySeries({
    sales: saleRows.map((sale) => ({ amount: sale.net, status: sale.status, on: utcDay(sale.soldAt) })),
    expenses: datedExpenses,
    from: range.from,
    to: range.to,
  });
  const projectSummary = projectRows.map((project) => {
    const actualCost = addMoney(
      datedExpenses
        .filter((row) => row.projectId === project.id && inRange(row.on, range.from, range.to) && countsTowardCost(row.status))
        .map((row) => row.amount),
    );
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      startDate: project.startDate,
      budget: project.budget,
      actualCost,
      variance: subtractMoney(project.budget, actualCost),
    };
  });

  return {
    range,
    period,
    current: {
      buyerDues: buyerDues(saleRows),
      cashBalance: accountList.total,
    },
    months,
    projects: projectSummary,
    overdue: notifications.filter((item) => item.kind === "overdue" && item.href.startsWith("/sales/")),
    pendingApprovals: notifications.filter((item) => item.kind === "approval"),
    notifications,
  };
}

export async function listNotifications(principal: Principal) {
  const today = todayUtc();
  const [installmentNotices, expenseNotices, approvalNotices] = await Promise.all([
    canView(principal, "sales") ? installmentDeadlines(today) : Promise.resolve([]),
    canView(principal, "expenses") ? expenseDeadlines(today) : Promise.resolve([]),
    approvalDeadlines(principal),
  ]);
  return [...installmentNotices, ...expenseNotices, ...approvalNotices].sort(byNotice);
}

async function installmentDeadlines(today: string) {
  const rows = await db
    .select({
      id: installments.id,
      saleId: installments.saleId,
      label: installments.label,
      dueDate: installments.dueDate,
      amount: installments.amount,
      saleStatus: sales.status,
      saleReference: sales.reference,
      buyerName: buyers.name,
    })
    .from(installments)
    .innerJoin(sales, eq(installments.saleId, sales.id))
    .innerJoin(buyers, eq(sales.buyerId, buyers.id));
  const ids = rows.map((row) => row.id);
  const allocations = ids.length
    ? await db
        .select({ installmentId: paymentAllocations.installmentId, amount: paymentAllocations.amount })
        .from(paymentAllocations)
        .where(inArray(paymentAllocations.installmentId, ids))
    : [];
  const outstanding = new Map(
    installmentPosition(
      rows.map((row) => ({ id: row.id, amount: row.amount })),
      allocations,
    ).map((row) => [row.id, row.outstanding]),
  );
  const notices: DashboardNotice[] = [];
  for (const row of rows) {
    if (row.saleStatus === "cancelled") continue;
    const due = outstanding.get(row.id) ?? row.amount;
    const kind = openDeadline(row.dueDate, today, due);
    if (!kind) continue;
    notices.push({
      id: `${kind}:installment:${row.id}`,
      kind,
      title: kind === "overdue" ? "Overdue installment" : "Installment due soon",
      detail: `${row.buyerName} · ${row.saleReference} · ${row.label || "Installment"} · due ${row.dueDate}`,
      at: row.dueDate,
      href: `/sales/${row.saleId}`,
      amount: due,
    });
  }
  return notices;
}

async function expenseDeadlines(today: string) {
  const rows = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      description: expenses.description,
      amount: expenses.amount,
      status: expenses.status,
      nextDueDate: expenses.nextDueDate,
    })
    .from(expenses);
  const notices: DashboardNotice[] = [];
  for (const row of rows) {
    if (!row.nextDueDate || !countsTowardCost(row.status)) continue;
    const kind = openDeadline(row.nextDueDate, today, row.amount);
    if (!kind) continue;
    notices.push({
      id: `${kind}:expense:${row.id}`,
      kind,
      title: kind === "overdue" ? "Overdue expense" : "Expense due soon",
      detail: [row.category, row.description].filter(Boolean).join(" · "),
      at: row.nextDueDate,
      href: `/expenses/${row.id}`,
      amount: row.amount,
    });
  }
  return notices;
}

async function approvalDeadlines(principal: Principal) {
  if (!canView(principal, "expenses")) return [];
  const rows = await db.select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.createdAt));
  const notices: DashboardNotice[] = [];
  for (const row of rows) {
    if (row.subjectType.startsWith("vendor_")) continue;
    notices.push({
      id: `approval:${row.id}`,
      kind: "approval",
      title: approvalTitles[row.subjectType] ?? "Awaiting approval",
      detail: row.note || "Waiting for a decision",
      at: row.createdAt.toISOString(),
      href: `/expenses/${row.subjectId}`,
      amount: row.amount,
    });
  }
  return notices;
}

function openDeadline(dueOn: string, today: string, outstanding: string): Exclude<DeadlineKind, "later"> | null {
  if (!stillDue(outstanding)) return null;
  const kind = deadlineKind(dueOn, today);
  return kind === "later" ? null : kind;
}

function canView(principal: Principal, module: string) {
  return principal.permissions.some((permission) => permission.module === module && permission.canView);
}

function byNotice(left: DashboardNotice, right: DashboardNotice) {
  const rank = { overdue: 0, upcoming: 1, approval: 2 };
  return rank[left.kind] - rank[right.kind] || left.at.localeCompare(right.at) || left.id.localeCompare(right.id);
}
