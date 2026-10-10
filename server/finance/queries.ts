import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { accountTransactions, accounts, employees, investmentReturns, investments, investors, projects, salarySlips } from "../db/schema";
import { addMoney } from "../projects/money";
import { accountBalance, investmentPosition, payrollTotals, salaryNet } from "./ledger";

const counterparty = alias(accounts, "counterparty");

export async function listInvestors() {
  const rows = await db
    .select({
      id: investors.id,
      name: investors.name,
      phone: investors.phone,
      note: investors.note,
      shareBps: investors.shareBps,
      createdAt: investors.createdAt,
    })
    .from(investors)
    .orderBy(asc(investors.name));
  return {
    investors: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      note: row.note,
      shareBps: row.shareBps,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function getInvestor(id: string) {
  const [row] = await db
    .select({
      id: investors.id,
      name: investors.name,
      phone: investors.phone,
      note: investors.note,
      shareBps: investors.shareBps,
      createdAt: investors.createdAt,
    })
    .from(investors)
    .where(eq(investors.id, id))
    .limit(1);
  if (!row) return null;
  return { investor: { ...row, createdAt: row.createdAt.toISOString() } };
}

export async function listInvestments() {
  const rows = await db
    .select({
      id: investments.id,
      investorName: investments.investorName,
      amount: investments.amount,
      expectedReturn: investments.expectedReturn,
      purpose: investments.purpose,
      method: investments.method,
      note: investments.note,
      reference: investments.reference,
      investedAt: investments.investedAt,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(investments)
    .leftJoin(projects, eq(investments.projectId, projects.id))
    .orderBy(desc(investments.investedAt), desc(investments.createdAt));
  const returned = await db
    .select({ investmentId: investmentReturns.investmentId, amount: investmentReturns.amount })
    .from(investmentReturns);
  const byInvestment = groupAmounts(returned);
  const items = rows.map((row) => presentInvestment(row, byInvestment.get(row.id) ?? []));
  return {
    investments: items,
    received: addMoney(items.map((item) => item.received)),
    returned: addMoney(items.map((item) => item.returned)),
    outstanding: addMoney(items.map((item) => item.outstanding)),
  };
}

export async function getInvestment(id: string) {
  const [row] = await db
    .select({
      id: investments.id,
      investorName: investments.investorName,
      amount: investments.amount,
      expectedReturn: investments.expectedReturn,
      purpose: investments.purpose,
      method: investments.method,
      note: investments.note,
      reference: investments.reference,
      investedAt: investments.investedAt,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(investments)
    .leftJoin(projects, eq(investments.projectId, projects.id))
    .where(eq(investments.id, id))
    .limit(1);
  if (!row) return null;
  const returns = await db
    .select()
    .from(investmentReturns)
    .where(eq(investmentReturns.investmentId, id))
    .orderBy(desc(investmentReturns.returnedAt), desc(investmentReturns.createdAt));
  return {
    investment: presentInvestment(
      row,
      returns.map((item) => item.amount),
    ),
    returns: returns.map((item) => ({
      id: item.id,
      amount: item.amount,
      method: item.method,
      note: item.note,
      returnedAt: item.returnedAt.toISOString(),
    })),
  };
}

export async function listAccounts() {
  const rows = await db.select().from(accounts).orderBy(asc(accounts.name));
  const movements = await db
    .select({ accountId: accountTransactions.accountId, kind: accountTransactions.kind, amount: accountTransactions.amount })
    .from(accountTransactions);
  const grouped = new Map<string, { kind: string; amount: string }[]>();
  for (const movement of movements) {
    const list = grouped.get(movement.accountId) ?? [];
    list.push(movement);
    grouped.set(movement.accountId, list);
  }
  const items = rows.map((row) => ({
    ...presentAccount(row),
    balance: accountBalance(grouped.get(row.id) ?? []),
  }));
  return { accounts: items, total: addMoney(items.map((item) => item.balance)) };
}

export async function getAccount(id: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!row) return null;
  const movements = await db
    .select({
      id: accountTransactions.id,
      kind: accountTransactions.kind,
      amount: accountTransactions.amount,
      note: accountTransactions.note,
      occurredAt: accountTransactions.occurredAt,
      transferGroup: accountTransactions.transferGroup,
      counterAccountId: accountTransactions.counterAccountId,
      counterName: counterparty.name,
    })
    .from(accountTransactions)
    .leftJoin(counterparty, eq(accountTransactions.counterAccountId, counterparty.id))
    .where(eq(accountTransactions.accountId, id))
    .orderBy(desc(accountTransactions.occurredAt), desc(accountTransactions.createdAt));
  return {
    account: {
      ...presentAccount(row),
      balance: accountBalance(movements),
    },
    transactions: movements.map((item) => ({
      id: item.id,
      kind: item.kind,
      amount: item.amount,
      note: item.note,
      occurredAt: item.occurredAt.toISOString(),
      transferGroup: item.transferGroup,
      counterAccount: item.counterAccountId ? { id: item.counterAccountId, name: item.counterName ?? "" } : null,
    })),
  };
}

export async function listEmployees() {
  const rows = await db.select().from(employees).orderBy(asc(employees.name));
  return { employees: rows.map(presentEmployee) };
}

export async function getEmployee(id: string) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!row) return null;
  const slips = await db
    .select()
    .from(salarySlips)
    .where(eq(salarySlips.employeeId, id))
    .orderBy(desc(salarySlips.period));
  return { employee: presentEmployee(row), slips: slips.map(presentSlip) };
}

export async function getSalarySlip(employeeId: string, slipId: string) {
  const [row] = await db
    .select({
      slip: salarySlips,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
    })
    .from(salarySlips)
    .innerJoin(employees, eq(salarySlips.employeeId, employees.id))
    .where(eq(salarySlips.id, slipId))
    .limit(1);
  if (!row || row.slip.employeeId !== employeeId) return null;
  return {
    slip: presentSlip(row.slip),
    employee: { id: employeeId, name: row.employeeName, jobTitle: row.jobTitle },
  };
}

export async function salarySummary(month: string) {
  const rows = await db
    .select({
      slip: salarySlips,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
    })
    .from(salarySlips)
    .innerJoin(employees, eq(salarySlips.employeeId, employees.id))
    .where(eq(salarySlips.period, month))
    .orderBy(asc(employees.name));
  const slips = rows.map((row) => ({
    ...presentSlip(row.slip),
    employee: { id: row.slip.employeeId, name: row.employeeName, jobTitle: row.jobTitle },
  }));
  return { month, slips, totals: payrollTotals(slips) };
}

function presentInvestment(
  row: {
    id: string;
    investorName: string;
    amount: string;
    expectedReturn: string;
    purpose: string;
    method: string;
    note: string;
    reference: string;
    investedAt: Date;
    projectId: string | null;
    projectName: string | null;
  },
  returnedAmounts: string[],
) {
  return {
    id: row.id,
    investorName: row.investorName,
    amount: row.amount,
    purpose: row.purpose,
    method: row.method,
    note: row.note,
    reference: row.reference,
    investedAt: row.investedAt.toISOString(),
    project: row.projectId ? { id: row.projectId, name: row.projectName ?? "" } : null,
    ...investmentPosition(row.amount, row.expectedReturn, returnedAmounts),
  };
}

function presentAccount(row: typeof accounts.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    accountNumber: row.accountNumber,
    note: row.note,
    isActive: row.isActive,
  };
}

function presentEmployee(row: typeof employees.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    jobTitle: row.jobTitle,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    monthlySalary: row.monthlySalary,
    status: row.status,
    joinedOn: row.joinedOn,
  };
}

function presentSlip(row: typeof salarySlips.$inferSelect) {
  const net = salaryNet(row.baseSalary, row.bonus, row.deduction, row.advance);
  if (net === null) throw new Error("Salary slip net is below zero.");
  return {
    id: row.id,
    employeeId: row.employeeId,
    period: row.period,
    baseSalary: row.baseSalary,
    bonus: row.bonus,
    deduction: row.deduction,
    advance: row.advance,
    net,
    status: row.status,
    paidOn: row.paidOn,
    note: row.note,
  };
}

function groupAmounts(rows: { investmentId: string; amount: string }[]) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.investmentId) ?? [];
    list.push(row.amount);
    grouped.set(row.investmentId, list);
  }
  return grouped;
}
