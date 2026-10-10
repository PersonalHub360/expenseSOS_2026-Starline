import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  accountTransactions,
  accounts,
  buyers,
  employees,
  expenses,
  payments,
  projects,
  refunds,
  salarySlips,
} from "../db/schema";
import { inRange, utcDay } from "../dashboard/ledger";
import { expenseTotal } from "../expenses/ledger";
import { listExpenses } from "../expenses/queries";
import { accountBalance, payrollTotals } from "../finance/ledger";
import { listInvestments } from "../finance/queries";
import { addMoney, compareMoney } from "../projects/money";
import { listProjects } from "../projects/queries";
import { listBookings, listSales } from "../sales/queries";
import { monthKey, monthsBetween, netCollected, profitOf, sumColumn } from "./ledger";
import type { ReportFilters, ReportKind } from "./validate";

export type ReportColumn = { key: string; label: string; money?: boolean };
export type ReportTotal = { key: string; label: string; value: string };
export type ReportTable = {
  kind: ReportKind;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals: ReportTotal[];
};

const expenseStatuses = new Set(["pending", "approved", "rejected", "void_pending", "void"]);

export async function buildReport(kind: ReportKind, filters: ReportFilters): Promise<ReportTable> {
  if (kind === "sales") return salesReport(filters);
  if (kind === "dues") return duesReport(filters);
  if (kind === "expenses") return expenseReport(filters);
  if (kind === "investments") return investmentReport(filters);
  if (kind === "projects") return projectReport(filters);
  if (kind === "salary") return salaryReport(filters);
  if (kind === "cashflow") return cashFlowReport(filters);
  return profitReport(filters);
}

export async function reportCatalog() {
  const [projectRows, buyerRows, categoryRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db.select({ id: buyers.id, name: buyers.name }).from(buyers).orderBy(asc(buyers.name)),
    db.selectDistinct({ category: expenses.category }).from(expenses).orderBy(asc(expenses.category)),
  ]);
  return { projects: projectRows, buyers: buyerRows, categories: categoryRows.map((row) => row.category) };
}

async function salesReport(filters: ReportFilters): Promise<ReportTable> {
  const [saleRows, bookingRows, paymentRows, refundRows] = await Promise.all([
    listSales(),
    listBookings(),
    db.select().from(payments),
    db.select().from(refunds),
  ]);
  const salesById = new Map(saleRows.map((sale) => [sale.id, sale]));
  const bookingsById = new Map(bookingRows.map((booking) => [booking.id, booking]));
  const rows: Record<string, string>[] = [];

  for (const sale of saleRows) {
    if (!matchesSale(sale, filters)) continue;
    rows.push({
      date: utcDay(sale.soldAt),
      type: "Sale",
      buyer: sale.buyer.name,
      project: sale.project.name,
      reference: sale.reference,
      status: sale.status,
      amount: sale.net,
    });
  }
  for (const payment of paymentRows) {
    const sale = payment.saleId ? salesById.get(payment.saleId) : undefined;
    const booking = payment.bookingId ? bookingsById.get(payment.bookingId) : undefined;
    const buyerId = sale?.buyer.id ?? booking?.buyer.id ?? "";
    const projectId = sale?.project.id ?? booking?.project.id ?? "";
    const status = sale?.status ?? booking?.status ?? "";
    if (!matchesLink(filters, utcDay(payment.paidAt), buyerId, projectId, status, false)) continue;
    rows.push({
      date: utcDay(payment.paidAt),
      type: "Payment",
      buyer: sale?.buyer.name ?? booking?.buyer.name ?? "",
      project: sale?.project.name ?? booking?.project.name ?? "",
      reference: payment.receiptNumber,
      status,
      amount: payment.amount,
    });
  }
  for (const refund of refundRows) {
    const booking = bookingsById.get(refund.bookingId);
    if (!matchesLink(filters, utcDay(refund.refundedAt), booking?.buyer.id ?? "", booking?.project.id ?? "", booking?.status ?? "", false)) {
      continue;
    }
    rows.push({
      date: utcDay(refund.refundedAt),
      type: "Refund",
      buyer: booking?.buyer.name ?? "",
      project: booking?.project.name ?? "",
      reference: refund.receiptNumber,
      status: booking?.status ?? "",
      amount: refund.amount,
    });
  }
  rows.sort((left, right) => left.date.localeCompare(right.date) || left.reference.localeCompare(right.reference));
  const sales = sumColumn(rows.filter((row) => row.type === "Sale"), "amount");
  const collected = sumColumn(rows.filter((row) => row.type === "Payment"), "amount");
  const refunded = sumColumn(rows.filter((row) => row.type === "Refund"), "amount");
  return {
    kind: "sales",
    title: "Sales and collections",
    columns: [
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "buyer", label: "Buyer" },
      { key: "project", label: "Project" },
      { key: "reference", label: "Reference" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount", money: true },
    ],
    rows,
    totals: [
      { key: "sales", label: "Sales", value: sales },
      { key: "collected", label: "Collected", value: collected },
      { key: "refunded", label: "Refunded", value: refunded },
      { key: "netCollected", label: "Net collected", value: netCollected(collected, refunded) },
    ],
  };
}

async function duesReport(filters: ReportFilters): Promise<ReportTable> {
  const rows = (await listSales())
    .filter((sale) => sale.status !== "cancelled" && compareMoney(sale.outstanding, "0.00") > 0)
    .filter((sale) => matchesSale(sale, filters, true))
    .map((sale) => ({
      buyer: sale.buyer.name,
      project: sale.project.name,
      reference: sale.reference,
      status: sale.status,
      outstanding: sale.outstanding,
    }));
  return {
    kind: "dues",
    title: "Buyer dues",
    columns: [
      { key: "buyer", label: "Buyer" },
      { key: "project", label: "Project" },
      { key: "reference", label: "Sale" },
      { key: "status", label: "Status" },
      { key: "outstanding", label: "Outstanding", money: true },
    ],
    rows,
    totals: [{ key: "outstanding", label: "Buyer dues", value: sumColumn(rows, "outstanding") }],
  };
}

async function expenseReport(filters: ReportFilters): Promise<ReportTable> {
  const listed = await listExpenses({
    q: "",
    projectId: filters.projectId ?? "",
    category: filters.category ?? "",
    status: filters.status ?? "",
    from: filters.from ?? "",
    to: filters.to ?? "",
  });
  const rows = listed.expenses.map((expense) => ({
    date: utcDay(expense.spentAt),
    category: expense.category,
    project: expense.project?.name ?? "",
    status: expense.status,
    description: expense.description,
    amount: expense.amount,
  }));
  return {
    kind: "expenses",
    title: "Expenses",
    columns: [
      { key: "date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "project", label: "Project" },
      { key: "status", label: "Status" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount", money: true },
    ],
    rows,
    totals: [{ key: "expenses", label: "Expenses", value: listed.total }],
  };
}

async function investmentReport(filters: ReportFilters): Promise<ReportTable> {
  const listed = await listInvestments();
  const rows = listed.investments
    .filter((item) => {
      if (!inRange(utcDay(item.investedAt), filters.from, filters.to)) return false;
      if (filters.projectId && item.project?.id !== filters.projectId) return false;
      if (filters.status && item.status !== filters.status) return false;
      return true;
    })
    .map((item) => ({
      date: utcDay(item.investedAt),
      investor: item.investorName,
      project: item.project?.name ?? "",
      status: item.status,
      amount: item.amount,
      returned: item.returned,
      outstanding: item.outstanding,
    }));
  return {
    kind: "investments",
    title: "Investments",
    columns: [
      { key: "date", label: "Date" },
      { key: "investor", label: "Investor" },
      { key: "project", label: "Project" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Principal", money: true },
      { key: "returned", label: "Returned", money: true },
      { key: "outstanding", label: "Outstanding", money: true },
    ],
    rows,
    totals: [
      { key: "principal", label: "Principal", value: sumColumn(rows, "amount") },
      { key: "returned", label: "Returned", value: sumColumn(rows, "returned") },
      { key: "outstanding", label: "Outstanding", value: sumColumn(rows, "outstanding") },
    ],
  };
}

async function projectReport(filters: ReportFilters): Promise<ReportTable> {
  const projectRows = await listProjects();
  const narrowed = Boolean(filters.from || filters.to || filters.category);
  const expenseRows = narrowed
    ? await db
        .select({
          projectId: expenses.projectId,
          amount: expenses.amount,
          status: expenses.status,
          category: expenses.category,
          spentAt: expenses.spentAt,
        })
        .from(expenses)
    : [];
  const rows = projectRows
    .filter((project) => !filters.projectId || project.id === filters.projectId)
    .filter((project) => !filters.status || project.status === filters.status)
    .map((project) => {
      const actualCost = narrowed
        ? expenseTotal(
            expenseRows.filter(
              (row) =>
                row.projectId === project.id &&
                inRange(utcDay(row.spentAt), filters.from, filters.to) &&
                (!filters.category || row.category.toLowerCase() === filters.category?.toLowerCase()),
            ),
          )
        : project.actualCost;
      return {
        project: project.name,
        status: project.status,
        budget: project.budget,
        actualCost,
        variance: subtractBudget(project.budget, actualCost),
      };
    });
  const budget = sumColumn(rows, "budget");
  const actualCost = sumColumn(rows, "actualCost");
  return {
    kind: "projects",
    title: "Project budget and cost",
    columns: [
      { key: "project", label: "Project" },
      { key: "status", label: "Status" },
      { key: "budget", label: "Budget", money: true },
      { key: "actualCost", label: "Actual cost", money: true },
      { key: "variance", label: "Variance", money: true },
    ],
    rows,
    totals: [
      { key: "budget", label: "Budget", value: budget },
      { key: "actualCost", label: "Actual cost", value: actualCost },
      { key: "variance", label: "Variance", value: subtractBudget(budget, actualCost) },
    ],
  };
}

async function salaryReport(filters: ReportFilters): Promise<ReportTable> {
  const slipRows = await db
    .select({ slip: salarySlips, employeeName: employees.name })
    .from(salarySlips)
    .innerJoin(employees, eq(salarySlips.employeeId, employees.id))
    .orderBy(asc(salarySlips.period), asc(employees.name));
  const chosen = slipRows.filter((row) => {
    const period = row.slip.period;
    if (filters.from && period < filters.from.slice(0, 7)) return false;
    if (filters.to && period > filters.to.slice(0, 7)) return false;
    if (filters.status && row.slip.status !== filters.status) return false;
    return true;
  });
  const rows = chosen.map((row) => ({
    period: row.slip.period,
    employee: row.employeeName,
    status: row.slip.status,
    base: row.slip.baseSalary,
    bonus: row.slip.bonus,
    deduction: row.slip.deduction,
    advance: row.slip.advance,
    net: payrollTotals([row.slip]).net,
  }));
  const totals = payrollTotals(chosen.map((row) => row.slip));
  return {
    kind: "salary",
    title: "Salary",
    columns: [
      { key: "period", label: "Period" },
      { key: "employee", label: "Employee" },
      { key: "status", label: "Status" },
      { key: "base", label: "Base", money: true },
      { key: "bonus", label: "Bonus", money: true },
      { key: "deduction", label: "Deduction", money: true },
      { key: "advance", label: "Advance", money: true },
      { key: "net", label: "Net", money: true },
    ],
    rows,
    totals: [
      { key: "base", label: "Base", value: totals.base },
      { key: "bonus", label: "Bonus", value: totals.bonus },
      { key: "deduction", label: "Deduction", value: totals.deduction },
      { key: "advance", label: "Advance", value: totals.advance },
      { key: "net", label: "Net", value: totals.net },
    ],
  };
}

async function cashFlowReport(filters: ReportFilters): Promise<ReportTable> {
  const movementRows = await db
    .select({
      id: accountTransactions.id,
      kind: accountTransactions.kind,
      amount: accountTransactions.amount,
      occurredAt: accountTransactions.occurredAt,
      accountName: accounts.name,
    })
    .from(accountTransactions)
    .innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
    .orderBy(asc(accountTransactions.occurredAt));
  const rows = movementRows
    .filter((row) => inRange(utcDay(row.occurredAt), filters.from, filters.to))
    .filter((row) => !filters.status || row.kind === filters.status)
    .map((row) => ({
      date: utcDay(row.occurredAt),
      account: row.accountName,
      kind: row.kind,
      amount: row.amount,
    }));
  return {
    kind: "cashflow",
    title: "Cash flow",
    columns: [
      { key: "date", label: "Date" },
      { key: "account", label: "Account" },
      { key: "kind", label: "Kind" },
      { key: "amount", label: "Amount", money: true },
    ],
    rows,
    totals: [
      { key: "deposits", label: "Deposits", value: sumKind(rows, "deposit") },
      { key: "withdrawals", label: "Withdrawals", value: sumKind(rows, "withdrawal") },
      { key: "transferIn", label: "Transfers in", value: sumKind(rows, "transfer_in") },
      { key: "transferOut", label: "Transfers out", value: sumKind(rows, "transfer_out") },
      { key: "net", label: "Net change", value: accountBalance(rows) },
    ],
  };
}

async function profitReport(filters: ReportFilters): Promise<ReportTable> {
  const expenseStatus = filters.status && expenseStatuses.has(filters.status) ? filters.status : "";
  const [collection, listed] = await Promise.all([
    salesReport({ ...filters, status: null, category: null }),
    listExpenses({
      q: "",
      projectId: filters.projectId ?? "",
      category: filters.category ?? "",
      status: expenseStatus,
      from: filters.from ?? "",
      to: filters.to ?? "",
    }),
  ]);
  const received = collection.totals.find((total) => total.key === "netCollected")?.value ?? "0.00";
  const spent = listed.total;
  const byMonth = new Map<string, { received: string[]; expenses: { amount: string; status: string }[] }>();
  for (const row of collection.rows) {
    if (row.type === "Sale") continue;
    const bucket = byMonth.get(monthKey(row.date)) ?? { received: [], expenses: [] };
    if (row.type === "Payment") bucket.received.push(row.amount);
    if (row.type === "Refund") bucket.received.push(signed(row.amount));
    byMonth.set(monthKey(row.date), bucket);
  }
  for (const expense of listed.expenses) {
    const month = monthKey(utcDay(expense.spentAt));
    const bucket = byMonth.get(month) ?? { received: [], expenses: [] };
    bucket.expenses.push(expense);
    byMonth.set(month, bucket);
  }
  const present = [...byMonth.keys()].sort();
  const start = filters.from ? monthKey(filters.from) : present[0];
  const end = filters.to ? monthKey(filters.to) : present[present.length - 1];
  const rows = (start && end ? monthsBetween(start, end) : []).map((month) => {
    const bucket = byMonth.get(month);
    const monthReceived = addMoney(bucket?.received ?? []);
    const monthExpenses = expenseTotal(bucket?.expenses ?? []);
    return { month, received: monthReceived, expenses: monthExpenses, profit: profitOf(monthReceived, monthExpenses) };
  });
  return {
    kind: "profit",
    title: "Profit and loss",
    columns: [
      { key: "month", label: "Month" },
      { key: "received", label: "Received", money: true },
      { key: "expenses", label: "Expenses", money: true },
      { key: "profit", label: "Profit / loss", money: true },
    ],
    rows,
    totals: [
      { key: "received", label: "Received", value: received },
      { key: "expenses", label: "Expenses", value: spent },
      { key: "profit", label: "Profit / loss", value: profitOf(received, spent) },
    ],
  };
}

function matchesSale(
  sale: { status: string; soldAt: string; buyer: { id: string }; project: { id: string } },
  filters: ReportFilters,
  keepOpen = false,
) {
  if (filters.status) {
    if (sale.status !== filters.status) return false;
  } else if (!keepOpen && sale.status === "cancelled") return false;
  return matchesLink(filters, utcDay(sale.soldAt), sale.buyer.id, sale.project.id, sale.status, true);
}

function matchesLink(
  filters: ReportFilters,
  day: string,
  buyerId: string,
  projectId: string,
  status: string,
  statusAlreadyApplied: boolean,
) {
  if (!inRange(day, filters.from, filters.to)) return false;
  if (filters.buyerId && buyerId !== filters.buyerId) return false;
  if (filters.projectId && projectId !== filters.projectId) return false;
  if (!statusAlreadyApplied && filters.status && status !== filters.status) return false;
  return true;
}

function sumKind(rows: { kind: string; amount: string }[], kind: string) {
  return addMoney(rows.filter((row) => row.kind === kind).map((row) => row.amount));
}

function subtractBudget(budget: string, actual: string) {
  return profitOf(budget, actual);
}

function signed(amount: string) {
  return amount.startsWith("-") ? amount.slice(1) : `-${amount}`;
}
