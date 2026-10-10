import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Principal } from "../auth/principal";
import { allows, type AppModule, type PermissionAction } from "../access";
import { db } from "../db/client";
import {
  accountTransactions,
  accounts,
  employees,
  investmentReturns,
  investments,
  investors,
  projects,
  recordFiles,
  salarySlips,
} from "../db/schema";
import { removeRecordFile } from "../files/storage";
import { compareMoney } from "../projects/money";
import { accountBalance, investmentPosition } from "./ledger";

export class FinanceDenied extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type InvestmentDraft = {
  investorName: string;
  amount: string;
  expectedReturn: string;
  investedOn: string;
  projectId: string | null;
  purpose: string;
  method: string;
  note: string;
  reference: string;
};

type ReturnDraft = { amount: string; method: string; returnedOn: string; note: string };

type AccountDraft = { name: string; kind: "cash" | "bank"; accountNumber: string; note: string; isActive: boolean };

type MovementDraft = { kind: "deposit" | "withdrawal"; amount: string; occurredOn: string; note: string };

type TransferDraft = { fromAccountId: string; toAccountId: string; amount: string; occurredOn: string; note: string };

type EmployeeDraft = {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  monthlySalary: string;
  status: "active" | "inactive";
  joinedOn: string | null;
};

type SlipDraft = {
  period: string;
  baseSalary: string;
  bonus: string;
  deduction: string;
  advance: string;
  status: "scheduled" | "paid";
  paidOn: string | null;
  note: string;
};

export async function createInvestor(principal: Principal, draft: { name: string; phone: string; note: string; shareBps: number; originalName: string }) {
  requireAction(principal, "investments", "add");
  const [existing] = await db
    .select({ id: investors.id })
    .from(investors)
    .where(sql`lower(${investors.name}) = lower(${draft.name})`)
    .limit(1);
  if (existing) throw new FinanceDenied("This investor is already saved.", 409);
  const [created] = await db.insert(investors).values({ name: draft.name, phone: draft.phone, note: draft.note, shareBps: draft.shareBps }).returning({ id: investors.id });
  if (!created) throw new Error("Investor was not stored.");
  if (draft.originalName && draft.originalName.toLocaleLowerCase() !== draft.name.toLocaleLowerCase()) {
    await renameInvestorRecords(draft.originalName, draft.name);
  }
  return created.id;
}

export async function updateInvestor(principal: Principal, id: string, draft: { name: string; phone: string; note: string; shareBps: number }) {
  requireAction(principal, "investments", "edit");
  const [current] = await db.select().from(investors).where(eq(investors.id, id)).limit(1);
  if (!current) throw new FinanceDenied("Investor not found.", 404);
  const [clash] = await db
    .select({ id: investors.id })
    .from(investors)
    .where(sql`lower(${investors.name}) = lower(${draft.name}) and ${investors.id} <> ${id}`)
    .limit(1);
  if (clash) throw new FinanceDenied("This investor is already saved.", 409);
  await db.update(investors).set({ name: draft.name, phone: draft.phone, note: draft.note, shareBps: draft.shareBps }).where(eq(investors.id, id));
  if (current.name.toLocaleLowerCase() !== draft.name.toLocaleLowerCase()) await renameInvestorRecords(current.name, draft.name);
  return id;
}

export async function deleteInvestor(principal: Principal, id: string) {
  requireAction(principal, "investments", "delete");
  const [current] = await db.select({ id: investors.id, name: investors.name }).from(investors).where(eq(investors.id, id)).limit(1);
  if (!current) throw new FinanceDenied("Investor not found.", 404);
  await deleteInvestorRecords(principal, current.name);
  await db.delete(investors).where(eq(investors.id, id));
}

export async function deleteInvestorByName(principal: Principal, name: string) {
  requireAction(principal, "investments", "delete");
  const [current] = await db
    .select({ id: investors.id })
    .from(investors)
    .where(sql`lower(${investors.name}) = lower(${name})`)
    .limit(1);
  if (current) {
    await deleteInvestor(principal, current.id);
    return current.id;
  }
  const removed = await deleteInvestorRecords(principal, name);
  if (!removed) throw new FinanceDenied("Investor not found.", 404);
  return null;
}

async function renameInvestorRecords(from: string, to: string) {
  await db.update(investments).set({ investorName: to }).where(sql`lower(${investments.investorName}) = lower(${from})`);
}

async function deleteInvestorRecords(principal: Principal, name: string) {
  const rows = await db
    .select({ id: investments.id })
    .from(investments)
    .where(sql`lower(${investments.investorName}) = lower(${name})`);
  if (rows.length === 0) return false;
  for (const row of rows) {
    const [returned] = await db
      .select({ id: investmentReturns.id })
      .from(investmentReturns)
      .where(eq(investmentReturns.investmentId, row.id))
      .limit(1);
    if (returned) throw new FinanceDenied("This investor has a return and cannot be deleted.", 409);
  }
  for (const row of rows) await deleteInvestment(principal, row.id);
  return true;
}

async function rememberInvestor(name: string) {
  if (!name.trim()) return;
  const [existing] = await db
    .select({ id: investors.id })
    .from(investors)
    .where(sql`lower(${investors.name}) = lower(${name})`)
    .limit(1);
  if (existing) return;
  await db.insert(investors).values({ name, phone: "", note: "" });
}

export async function createInvestment(principal: Principal, draft: InvestmentDraft) {
  requireAction(principal, "investments", "add");
  await assertProject(draft.projectId);
  await rememberInvestor(draft.investorName);
  const [created] = await db
    .insert(investments)
    .values({
      investorName: draft.investorName,
      amount: draft.amount,
      expectedReturn: draft.expectedReturn,
      investedAt: atUtc(draft.investedOn),
      projectId: draft.projectId,
      purpose: draft.purpose,
      method: draft.method,
      note: draft.note,
      reference: draft.reference,
    })
    .returning({ id: investments.id });
  if (!created) throw new Error("Investment was not stored.");
  return created.id;
}

export async function recordInvestmentReturn(principal: Principal, investmentId: string, draft: ReturnDraft) {
  requireAction(principal, "investments", "add");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from investments where id = ${investmentId} for update`);
    const [investment] = await tx.select().from(investments).where(eq(investments.id, investmentId)).limit(1);
    if (!investment) throw new FinanceDenied("Investment not found.", 404);
    const prior = await tx
      .select({ amount: investmentReturns.amount })
      .from(investmentReturns)
      .where(eq(investmentReturns.investmentId, investmentId));
    const position = investmentPosition(investment.amount, investment.expectedReturn, [
      ...prior.map((row) => row.amount),
      draft.amount,
    ]);
    if (compareMoney(position.outstanding, "0.00") < 0) {
      throw new FinanceDenied("Return is more than the outstanding amount.", 400);
    }
    const [created] = await tx
      .insert(investmentReturns)
      .values({
        investmentId,
        amount: draft.amount,
        method: draft.method,
        note: draft.note,
        returnedAt: atUtc(draft.returnedOn),
      })
      .returning({ id: investmentReturns.id });
    if (!created) throw new Error("Return was not stored.");
    return created.id;
  });
}

export async function updateInvestment(principal: Principal, id: string, draft: InvestmentDraft) {
  requireAction(principal, "investments", "edit");
  await assertProject(draft.projectId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from investments where id = ${id} for update`);
    const [current] = await tx.select().from(investments).where(eq(investments.id, id)).limit(1);
    if (!current) throw new FinanceDenied("Investment not found.", 404);
    const prior = await tx
      .select({ amount: investmentReturns.amount })
      .from(investmentReturns)
      .where(eq(investmentReturns.investmentId, id));
    if (prior.length > 0 && draft.amount !== current.amount) {
      throw new FinanceDenied("The amount cannot change after a return has been recorded.", 409);
    }
    const position = investmentPosition(
      draft.amount,
      draft.expectedReturn,
      prior.map((row) => row.amount),
    );
    if (compareMoney(position.outstanding, "0.00") < 0) {
      throw new FinanceDenied("Expected return cannot drop below the amount already returned.", 400);
    }
    await tx
      .update(investments)
      .set({
        investorName: draft.investorName,
        amount: draft.amount,
        expectedReturn: draft.expectedReturn,
        investedAt: atUtc(draft.investedOn),
        projectId: draft.projectId,
        purpose: draft.purpose,
        method: draft.method,
        note: draft.note,
        reference: draft.reference,
      })
      .where(eq(investments.id, id));
    return id;
  });
}

export async function deleteInvestment(principal: Principal, id: string) {
  requireAction(principal, "investments", "delete");
  const fileKeys: string[] = [];
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from investments where id = ${id} for update`);
    const [current] = await tx.select({ id: investments.id }).from(investments).where(eq(investments.id, id)).limit(1);
    if (!current) throw new FinanceDenied("Investment not found.", 404);
    const [returned] = await tx
      .select({ id: investmentReturns.id })
      .from(investmentReturns)
      .where(eq(investmentReturns.investmentId, id))
      .limit(1);
    if (returned) throw new FinanceDenied("This capital has a return and cannot be deleted.", 409);
    const files = await tx
      .select({ storageKey: recordFiles.storageKey })
      .from(recordFiles)
      .where(and(eq(recordFiles.subjectType, "investment"), eq(recordFiles.subjectId, id)));
    fileKeys.push(...files.map((file) => file.storageKey));
    if (files.length > 0) {
      await tx.delete(recordFiles).where(and(eq(recordFiles.subjectType, "investment"), eq(recordFiles.subjectId, id)));
    }
    await tx.delete(investments).where(eq(investments.id, id));
  });
  for (const key of fileKeys) await removeRecordFile(key);
}

export async function createAccount(principal: Principal, draft: AccountDraft) {
  requireAction(principal, "accounts", "add");
  try {
    const [created] = await db.insert(accounts).values(draft).returning({ id: accounts.id });
    if (!created) throw new Error("Account was not stored.");
    return created.id;
  } catch (error) {
    if (pgCode(error) === "23505") throw new FinanceDenied("An account with this name already exists.", 409);
    throw error;
  }
}

export async function updateAccount(principal: Principal, id: string, draft: AccountDraft) {
  requireAction(principal, "accounts", "edit");
  try {
    const [updated] = await db
      .update(accounts)
      .set({ ...draft, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .returning({ id: accounts.id });
    if (!updated) throw new FinanceDenied("Account not found.", 404);
    return updated.id;
  } catch (error) {
    if (error instanceof FinanceDenied) throw error;
    if (pgCode(error) === "23505") throw new FinanceDenied("An account with this name already exists.", 409);
    throw error;
  }
}

export async function recordMovement(principal: Principal, accountId: string, draft: MovementDraft) {
  requireAction(principal, "accounts", "add");
  return db.transaction(async (tx) => {
    const account = await lockAccount(tx, accountId);
    if (!account.isActive) throw new FinanceDenied("This account is inactive.", 409);
    if (draft.kind === "withdrawal") await assertFunds(tx, accountId, draft.amount);
    const [created] = await tx
      .insert(accountTransactions)
      .values({
        accountId,
        kind: draft.kind,
        amount: draft.amount,
        note: draft.note,
        occurredAt: atUtc(draft.occurredOn),
      })
      .returning({ id: accountTransactions.id });
    if (!created) throw new Error("Transaction was not stored.");
    return created.id;
  });
}

export async function transferFunds(principal: Principal, draft: TransferDraft) {
  requireAction(principal, "accounts", "add");
  const [first, second] = [draft.fromAccountId, draft.toAccountId].sort();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from accounts where id = ${first} for update`);
    await tx.execute(sql`select id from accounts where id = ${second} for update`);
    const rows = await tx
      .select()
      .from(accounts)
      .where(inArray(accounts.id, [draft.fromAccountId, draft.toAccountId]));
    const source = rows.find((row) => row.id === draft.fromAccountId);
    const target = rows.find((row) => row.id === draft.toAccountId);
    if (!source || !target) throw new FinanceDenied("Choose accounts that exist.", 400);
    if (!source.isActive || !target.isActive) throw new FinanceDenied("Both accounts must be active.", 409);
    await assertFunds(tx, source.id, draft.amount);
    const group = randomUUID();
    const when = atUtc(draft.occurredOn);
    await tx.insert(accountTransactions).values([
      {
        accountId: source.id,
        kind: "transfer_out",
        amount: draft.amount,
        transferGroup: group,
        counterAccountId: target.id,
        note: draft.note,
        occurredAt: when,
      },
      {
        accountId: target.id,
        kind: "transfer_in",
        amount: draft.amount,
        transferGroup: group,
        counterAccountId: source.id,
        note: draft.note,
        occurredAt: when,
      },
    ]);
    return group;
  });
}

export async function createEmployee(principal: Principal, draft: EmployeeDraft) {
  requireAction(principal, "employees", "add");
  const [created] = await db.insert(employees).values(draft).returning({ id: employees.id });
  if (!created) throw new Error("Employee was not stored.");
  return created.id;
}

export async function updateEmployee(principal: Principal, id: string, draft: EmployeeDraft) {
  requireAction(principal, "employees", "edit");
  const [updated] = await db
    .update(employees)
    .set({ ...draft, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning({ id: employees.id });
  if (!updated) throw new FinanceDenied("Employee not found.", 404);
  return updated.id;
}

export async function createSalarySlip(principal: Principal, employeeId: string, draft: SlipDraft) {
  requireAction(principal, "employees", "add");
  const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new FinanceDenied("Employee not found.", 404);
  try {
    const [created] = await db
      .insert(salarySlips)
      .values({ employeeId, ...slipValues(draft) })
      .returning({ id: salarySlips.id });
    if (!created) throw new Error("Salary slip was not stored.");
    return created.id;
  } catch (error) {
    if (pgCode(error) === "23505") throw new FinanceDenied("This employee already has a slip for that month.", 409);
    throw error;
  }
}

export async function updateSalarySlip(principal: Principal, employeeId: string, slipId: string, draft: SlipDraft) {
  requireAction(principal, "employees", "edit");
  const [current] = await db
    .select()
    .from(salarySlips)
    .where(and(eq(salarySlips.id, slipId), eq(salarySlips.employeeId, employeeId)))
    .limit(1);
  if (!current) throw new FinanceDenied("Salary slip not found.", 404);
  if (current.status === "paid") throw new FinanceDenied("A paid salary slip cannot be changed.", 409);
  const [updated] = await db
    .update(salarySlips)
    .set({ ...slipValues(draft), updatedAt: new Date() })
    .where(eq(salarySlips.id, slipId))
    .returning({ id: salarySlips.id });
  if (!updated) throw new FinanceDenied("Salary slip not found.", 404);
  return updated.id;
}

async function assertProject(projectId: string | null) {
  if (!projectId) return;
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new FinanceDenied("Choose a project that exists.", 400);
}

async function lockAccount(tx: Tx, id: string) {
  await tx.execute(sql`select id from accounts where id = ${id} for update`);
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) throw new FinanceDenied("Account not found.", 404);
  return account;
}

async function assertFunds(tx: Tx, accountId: string, amount: string) {
  const rows = await tx
    .select({ kind: accountTransactions.kind, amount: accountTransactions.amount })
    .from(accountTransactions)
    .where(eq(accountTransactions.accountId, accountId));
  const balance = accountBalance(rows);
  if (compareMoney(amount, balance) > 0) throw new FinanceDenied("This account does not have enough balance.", 400);
}

function slipValues(draft: SlipDraft) {
  return {
    period: draft.period,
    baseSalary: draft.baseSalary,
    bonus: draft.bonus,
    deduction: draft.deduction,
    advance: draft.advance,
    status: draft.status,
    paidOn: draft.paidOn,
    note: draft.note,
  };
}

function requireAction(principal: Principal, module: AppModule, action: PermissionAction) {
  const permission = principal.permissions.find((item) => item.module === module);
  if (!allows(permission, action)) throw new FinanceDenied("You do not have access to this action", 403);
}

function atUtc(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function pgCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
