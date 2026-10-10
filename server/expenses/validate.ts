import { z } from "zod";
import { paymentMethods } from "../sales/validate";
import { normalizeMoney } from "../projects/money";
import { parseCalendarDate } from "./dates";

const frequencies = ["monthly", "quarterly", "yearly"] as const;
const vendorKinds = ["supplier", "contractor"] as const;
const decisions = ["approved", "rejected"] as const;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || z.string().uuid().safeParse(value).success, "Choose a valid record.");

export function parseVendor(body: unknown) {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter the vendor name.").max(160),
      phone: z.string().trim().max(40).optional().default(""),
      email: z.string().trim().max(160).optional().default(""),
      address: z.string().trim().max(300).optional().default(""),
      notes: z.string().trim().max(2000).optional().default(""),
      kind: z.enum(vendorKinds).optional().default("supplier"),
    })
    .superRefine((value, context) => {
      if (!validPhone(value.phone)) {
        context.addIssue({ code: "custom", path: ["phone"], message: "Enter a phone number with 6 to 15 digits." });
      }
      if (!validEmail(value.email)) {
        context.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
      }
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the vendor.");
  return { ok: true as const, value: parsed.data };
}

export function parseExpenseInput(body: unknown) {
  const parsed = z
    .object({
      projectId: optionalUuid,
      vendorId: optionalUuid,
      category: z.string().trim().min(1, "Enter an expense category.").max(80),
      description: z.string().trim().max(500).optional().default(""),
      note: z.string().trim().max(500).optional().default(""),
      amount: z.string().trim(),
      method: z.enum(paymentMethods).optional().default("cash"),
      accountId: optionalUuid,
      spentOn: z.string().trim(),
      frequency: z.enum(frequencies).nullable().optional().default(null),
      nextDueDate: z.string().trim().optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the expense.");
  const amount = positiveMoney(parsed.data.amount, "Enter an expense amount greater than zero.");
  if (!amount.ok) return amount;
  const spentOn = parseCalendarDate(parsed.data.spentOn);
  if (!spentOn) return fail("Use a real expense date.");
  const recurrence = recurrenceOf(parsed.data.frequency, parsed.data.nextDueDate);
  if (!recurrence.ok) return recurrence;
  return {
    ok: true as const,
    value: {
      projectId: parsed.data.projectId,
      vendorId: parsed.data.vendorId,
      category: parsed.data.category,
      description: parsed.data.description,
      note: parsed.data.note,
      amount: amount.value,
      method: parsed.data.method,
      accountId: parsed.data.accountId,
      spentOn,
      frequency: recurrence.frequency,
      nextDueDate: recurrence.nextDueDate,
    },
  };
}

export function parseBill(body: unknown) {
  const parsed = z
    .object({
      vendorId: z.string().uuid("Choose a vendor."),
      projectId: optionalUuid,
      description: z.string().trim().max(500).optional().default(""),
      amount: z.string().trim(),
      billDate: z.string().trim(),
      dueDate: z.string().trim(),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the bill.");
  const amount = positiveMoney(parsed.data.amount, "Enter a bill amount greater than zero.");
  if (!amount.ok) return amount;
  const billDate = parseCalendarDate(parsed.data.billDate);
  const dueDate = parseCalendarDate(parsed.data.dueDate);
  if (!billDate || !dueDate) return fail("Use real bill and due dates.");
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, billDate, dueDate } };
}

export function parseVendorPayment(body: unknown) {
  const parsed = z
    .object({
      billId: z.string().uuid("Choose a bill."),
      amount: z.string().trim(),
      method: z.enum(paymentMethods).optional().default("cash"),
      accountId: optionalUuid,
      note: z.string().trim().max(500).optional().default(""),
      paidOn: z.string().trim().optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the payment.");
  const amount = positiveMoney(parsed.data.amount, "Enter a payment amount greater than zero.");
  if (!amount.ok) return amount;
  const paidOn = parsed.data.paidOn ? parseCalendarDate(parsed.data.paidOn) : null;
  if (parsed.data.paidOn && !paidOn) return fail("Use a real payment date.");
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, paidOn } };
}

export function parseDecision(body: unknown) {
  const parsed = z
    .object({
      decision: z.enum(decisions),
      note: z.string().trim().max(500).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the decision.");
  return { ok: true as const, value: parsed.data };
}

export function parseReceiptUpload(body: unknown) {
  const parsed = z
    .object({
      fileName: z.string().trim().min(1, "Choose a receipt file.").max(180),
      contentType: z.string().trim().min(1).max(80),
      data: z.string().min(1, "The receipt file is empty.").max(2_100_000),
    })
    .safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the receipt.");
  return { ok: true as const, value: parsed.data };
}

export function parseExpenseFilters(query: Record<string, unknown>) {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const projectId = text(query.projectId);
  const category = text(query.category);
  const status = text(query.status);
  const from = text(query.from);
  const to = text(query.to);
  const q = text(query.q).slice(0, 120);
  if (projectId && !z.string().uuid().safeParse(projectId).success) return fail("Choose a valid project.");
  if (from && !parseCalendarDate(from)) return fail("Use a real start date.");
  if (to && !parseCalendarDate(to)) return fail("Use a real end date.");
  const statuses = ["pending", "approved", "rejected", "void_pending", "void"];
  if (status && !statuses.includes(status)) return fail("Choose a valid status.");
  return {
    ok: true as const,
    value: { q, projectId, category: category.slice(0, 80), status, from, to },
  };
}

function recurrenceOf(frequency: "monthly" | "quarterly" | "yearly" | null, nextDueDate: string) {
  if (!frequency && !nextDueDate) return { ok: true as const, frequency: null, nextDueDate: null };
  if (!frequency || !nextDueDate) return fail("A recurring expense needs both a frequency and a next due date.");
  const due = parseCalendarDate(nextDueDate);
  if (!due) return fail("Use a real next due date.");
  return { ok: true as const, frequency, nextDueDate: due };
}

function positiveMoney(value: string, message: string) {
  const amount = normalizeMoney(value);
  if (!amount || amount === "0.00") return fail(message);
  return { ok: true as const, value: amount };
}

function validPhone(value: string) {
  if (!value) return true;
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 15 && /^[+\d][\d\s()-]*$/.test(value);
}

function validEmail(value: string) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fail(error: string) {
  return { ok: false as const, error };
}
