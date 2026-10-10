import { z } from "zod";
import { paymentMethods } from "../sales/validate";
import { normalizeMoney } from "../projects/money";
import { parseCalendarDate } from "../expenses/dates";
import { salaryNet } from "./ledger";

const accountKinds = ["cash", "bank"] as const;
const movementKinds = ["deposit", "withdrawal"] as const;
const salaryStatuses = ["scheduled", "paid"] as const;
const employeeStatuses = ["active", "inactive"] as const;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || z.string().uuid().safeParse(value).success, "Choose a valid record.");

export function parseInvestor(body: unknown) {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter the investor name.").max(160),
      phone: z.string().trim().max(40).optional().default(""),
      note: z.string().trim().max(500).optional().default(""),
      share: z.string().trim(),
      originalName: z.string().trim().max(160).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the investor.");
  if (parsed.data.phone && !/^[0-9+\s()-]+$/.test(parsed.data.phone)) return fail("Use a real phone number.");
  const shareBps = shareBasisPoints(parsed.data.share);
  if (shareBps === null) return fail("Enter a share from 0% to 100%.");
  return { ok: true as const, value: { name: parsed.data.name, phone: parsed.data.phone, note: parsed.data.note, shareBps, originalName: parsed.data.originalName } };
}

function shareBasisPoints(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (bps < 0n || bps > 10000n) return null;
  return Number(bps);
}

export function parseInvestment(body: unknown) {
  const parsed = z
    .object({
      investorName: z.string().trim().max(160).optional().default(""),
      amount: z.string().trim(),
      expectedReturn: z.string().trim().optional().default("0"),
      investedOn: z.string().trim(),
      projectId: optionalUuid,
      purpose: z.string().trim().max(300).optional().default(""),
      method: z.enum(paymentMethods).optional().default("cash"),
      note: z.string().trim().max(500).optional().default(""),
      reference: z.string().trim().max(160).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the investment.");
  const amount = positiveMoney(parsed.data.amount, "Enter an investment amount greater than zero.");
  if (!amount.ok) return amount;
  const expectedReturn = nonNegativeMoney(parsed.data.expectedReturn, "Enter an expected return of zero or more.");
  if (!expectedReturn.ok) return expectedReturn;
  const investedOn = parseCalendarDate(parsed.data.investedOn);
  if (!investedOn) return fail("Use a real investment date.");
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, expectedReturn: expectedReturn.value, investedOn } };
}

export function parseInvestmentReturn(body: unknown) {
  const parsed = z
    .object({
      amount: z.string().trim(),
      method: z.enum(paymentMethods).optional().default("cash"),
      returnedOn: z.string().trim(),
      note: z.string().trim().max(500).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the return.");
  const amount = positiveMoney(parsed.data.amount, "Enter a return amount greater than zero.");
  if (!amount.ok) return amount;
  const returnedOn = parseCalendarDate(parsed.data.returnedOn);
  if (!returnedOn) return fail("Use a real return date.");
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, returnedOn } };
}

export function parseAccount(body: unknown) {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter the account name.").max(120),
      kind: z.enum(accountKinds),
      accountNumber: z.string().trim().max(40).optional().default(""),
      note: z.string().trim().max(500).optional().default(""),
      isActive: z.boolean().optional().default(true),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the account.");
  return { ok: true as const, value: parsed.data };
}

export function parseAccountMovement(body: unknown) {
  const parsed = z
    .object({
      kind: z.enum(movementKinds),
      amount: z.string().trim(),
      occurredOn: z.string().trim(),
      note: z.string().trim().max(500).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the transaction.");
  const amount = positiveMoney(parsed.data.amount, "Enter an amount greater than zero.");
  if (!amount.ok) return amount;
  const occurredOn = parseCalendarDate(parsed.data.occurredOn);
  if (!occurredOn) return fail("Use a real transaction date.");
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, occurredOn } };
}

export function parseTransfer(body: unknown) {
  const parsed = z
    .object({
      fromAccountId: z.string().uuid("Choose the account to transfer from."),
      toAccountId: z.string().uuid("Choose the account to transfer to."),
      amount: z.string().trim(),
      occurredOn: z.string().trim(),
      note: z.string().trim().max(500).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the transfer.");
  if (parsed.data.fromAccountId === parsed.data.toAccountId) return fail("Choose two different accounts.");
  const amount = positiveMoney(parsed.data.amount, "Enter a transfer amount greater than zero.");
  if (!amount.ok) return amount;
  const occurredOn = parseCalendarDate(parsed.data.occurredOn);
  if (!occurredOn) return fail("Use a real transfer date.");
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, occurredOn } };
}

export function parseEmployee(body: unknown) {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter the employee name.").max(160),
      jobTitle: z.string().trim().max(120).optional().default(""),
      phone: z.string().trim().max(40).optional().default(""),
      email: z.string().trim().max(160).optional().default(""),
      address: z.string().trim().max(300).optional().default(""),
      notes: z.string().trim().max(2000).optional().default(""),
      monthlySalary: z.string().trim(),
      status: z.enum(employeeStatuses).optional().default("active"),
      joinedOn: z.string().trim().optional().default(""),
    })
    .superRefine((value, context) => {
      if (value.phone && !validPhone(value.phone)) {
        context.addIssue({ code: "custom", path: ["phone"], message: "Enter a phone number with 6 to 15 digits." });
      }
      if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
        context.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
      }
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the employee.");
  const monthlySalary = nonNegativeMoney(parsed.data.monthlySalary, "Enter a monthly salary of zero or more.");
  if (!monthlySalary.ok) return monthlySalary;
  const joinedOn = parsed.data.joinedOn ? parseCalendarDate(parsed.data.joinedOn) : null;
  if (parsed.data.joinedOn && !joinedOn) return fail("Use a real joining date.");
  return { ok: true as const, value: { ...parsed.data, monthlySalary: monthlySalary.value, joinedOn } };
}

export function parseSalarySlip(body: unknown, fallbackBase: string) {
  const parsed = z
    .object({
      period: z.string().trim(),
      baseSalary: z.string().trim().optional().default(""),
      bonus: z.string().trim().optional().default("0"),
      deduction: z.string().trim().optional().default("0"),
      advance: z.string().trim().optional().default("0"),
      status: z.enum(salaryStatuses).optional().default("scheduled"),
      paidOn: z.string().trim().optional().default(""),
      note: z.string().trim().max(500).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the salary slip.");
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(parsed.data.period)) return fail("Use a month like 2026-10.");
  const baseSalary = nonNegativeMoney(parsed.data.baseSalary || fallbackBase, "Enter a base salary of zero or more.");
  if (!baseSalary.ok) return baseSalary;
  const bonus = nonNegativeMoney(parsed.data.bonus, "Enter a bonus of zero or more.");
  if (!bonus.ok) return bonus;
  const deduction = nonNegativeMoney(parsed.data.deduction, "Enter a deduction of zero or more.");
  if (!deduction.ok) return deduction;
  const advance = nonNegativeMoney(parsed.data.advance, "Enter an advance of zero or more.");
  if (!advance.ok) return advance;
  const net = salaryNet(baseSalary.value, bonus.value, deduction.value, advance.value);
  if (net === null) return fail("Deduction and advance cannot exceed base salary plus bonus.");
  const paidOn = parsed.data.paidOn ? parseCalendarDate(parsed.data.paidOn) : null;
  if (parsed.data.paidOn && !paidOn) return fail("Use a real payment date.");
  if (parsed.data.status === "paid" && !paidOn) return fail("A paid salary needs a payment date.");
  return {
    ok: true as const,
    value: {
      period: parsed.data.period,
      baseSalary: baseSalary.value,
      bonus: bonus.value,
      deduction: deduction.value,
      advance: advance.value,
      net,
      status: parsed.data.status,
      paidOn,
      note: parsed.data.note,
    },
  };
}

export function parseSalaryMonth(value: unknown) {
  const month = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Use a month like 2026-10.");
  return { ok: true as const, value: month };
}

function positiveMoney(value: string, message: string) {
  const amount = normalizeMoney(value);
  if (!amount || amount === "0.00") return fail(message);
  return { ok: true as const, value: amount };
}

function nonNegativeMoney(value: string, message: string) {
  const amount = normalizeMoney(value);
  if (!amount) return fail(message);
  return { ok: true as const, value: amount };
}

function validPhone(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 15 && /^[+\d][\d\s()-]*$/.test(value);
}

function fail(error: string) {
  return { ok: false as const, error };
}
