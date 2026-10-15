import { z } from "zod";
import { planInstallments, yearsFromSchedule } from "../../src/lib/installmentPlan";
import { addMoney, compareMoney, normalizeMoney } from "../projects/money";
import { netPayable } from "./ledger";

export const paymentMethods = ["cash", "bank", "bkash", "nagad", "cheque"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

const methodField = z.enum(paymentMethods).default("cash");

const buyerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the buyer name.").max(160),
    phone: z.string().trim().max(40).optional().default(""),
    email: z.string().trim().max(160).optional().default(""),
    address: z.string().trim().max(300).optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
    projectName: z.string().trim().max(160).optional().default(""),
    flatAmount: z.string().trim().max(20).optional().default(""),
    size: z.string().trim().max(80).optional().default(""),
    installmentPayment: z.string().trim().max(20).optional().default(""),
    installmentAmount: z.string().trim().max(20).optional().default(""),
    installmentSchedule: z.enum(["", "monthly", "yearly", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]).optional().default(""),
    paymentAlertOn: z.string().trim().optional().default(""),
    dealStatus: z.enum(["", "booking", "running", "completed", "cancelled"]).optional().default(""),
  })
  .superRefine((value, context) => {
    if (!validPhone(value.phone)) {
      context.addIssue({ code: "custom", path: ["phone"], message: "Enter a phone number with 6 to 15 digits." });
    }
    if (!validEmail(value.email)) {
      context.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
    }
  });

export function parseBuyer(body: unknown) {
  const parsed = buyerSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the buyer details.");
  const flatAmount = optionalMoney(parsed.data.flatAmount, "the total flat amount");
  if (!flatAmount.ok) return flatAmount;
  const installmentPayment = optionalMoney(parsed.data.installmentPayment, "the installment payment");
  if (!installmentPayment.ok) return installmentPayment;
  const installmentAmount = optionalMoney(parsed.data.installmentAmount, "the installment amount");
  if (!installmentAmount.ok) return installmentAmount;
  if (parsed.data.paymentAlertOn && !isCalendarDate(parsed.data.paymentAlertOn)) {
    return fail("Use a real payment alert date.");
  }
  const years = yearsFromSchedule(parsed.data.installmentSchedule);
  let monthly = installmentAmount.value;
  if (years) {
    if (!flatAmount.value || !installmentPayment.value) {
      return fail("Enter the flat price and downpayment for this installment type.");
    }
    const plan = planInstallments(flatAmount.value, installmentPayment.value, years);
    if (!plan) return fail("Downpayment cannot be more than the flat price, and the balance must cover each month.");
    monthly = plan.months === 0 ? "" : plan.regular;
  }
  return {
    ok: true as const,
    value: {
      ...parsed.data,
      flatAmount: flatAmount.value,
      installmentPayment: installmentPayment.value,
      installmentAmount: monthly,
    },
  };
}

function optionalMoney(value: string, label: string) {
  if (!value) return { ok: true as const, value: "" };
  const money = normalizeMoney(value);
  if (!money) return fail(`Enter ${label} with up to 2 decimal places.`);
  return { ok: true as const, value: money };
}

const bookingSchema = z.object({
  buyerId: z.string().uuid("Choose a buyer."),
  unitId: z.string().uuid("Choose a unit."),
  amount: z.string().trim(),
  method: methodField,
  note: z.string().trim().max(500).optional().default(""),
  installmentYears: z.number().int().min(1).max(10).optional(),
});

export function parseBooking(body: unknown) {
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the booking.");
  const amount = positiveMoney(parsed.data.amount, "Enter a booking amount greater than zero.");
  if (!amount.ok) return amount;
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, installmentYears: parsed.data.installmentYears ?? 0 } };
}

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Enter the reason for cancellation.").max(500),
  refundAmount: z.string().trim(),
  method: methodField,
  note: z.string().trim().max(500).optional().default(""),
});

export function parseCancellation(body: unknown) {
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the cancellation.");
  const refundAmount = normalizeMoney(parsed.data.refundAmount);
  if (!refundAmount || compareMoney(refundAmount, "0.00") < 0) {
    return fail("Enter a refund of zero or more, with up to 2 decimal places.");
  }
  return { ok: true as const, value: { ...parsed.data, refundAmount } };
}

const installmentSchema = z.object({
  label: z.string().trim().max(80).optional().default(""),
  dueDate: z.string().trim().refine(isCalendarDate, "Use a real due date."),
  amount: z.string().trim(),
});

const saleSchema = z.object({
  bookingId: z.string().uuid("Choose a booking."),
  listPrice: z.string().trim(),
  discount: z.string().trim().optional().default("0"),
  installments: z.array(installmentSchema).min(1, "Add at least one installment.").max(121, "Use 121 installments or fewer."),
});

export function parseSale(body: unknown) {
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the sale.");
  const priced = parseSaleParts(parsed.data);
  if (!priced.ok) return priced;
  return { ok: true as const, value: { bookingId: parsed.data.bookingId, ...priced.value } };
}

export function parseSaleUpdate(body: unknown) {
  const parsed = saleSchema.omit({ bookingId: true }).safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the sale.");
  return parseSaleParts(parsed.data);
}

const bookingUpdateSchema = z.object({
  amount: z.string().trim(),
  note: z.string().trim().max(500).optional().default(""),
});

export function parseBookingUpdate(body: unknown) {
  const parsed = bookingUpdateSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the booking.");
  const amount = positiveMoney(parsed.data.amount, "Enter a booking amount greater than zero.");
  if (!amount.ok) return amount;
  return { ok: true as const, value: { amount: amount.value, note: parsed.data.note } };
}

function parseSaleParts(data: { listPrice: string; discount: string; installments: { label: string; dueDate: string; amount: string }[] }) {
  const listPrice = positiveMoney(data.listPrice, "Enter a sale price greater than zero.");
  if (!listPrice.ok) return listPrice;
  const discount = normalizeMoney(data.discount);
  if (!discount) return fail("Enter a discount of zero or more, with up to 2 decimal places.");
  const priced = netPayable(listPrice.value, discount);
  if (!priced.ok) return priced;

  const installments = [];
  for (const [index, installment] of data.installments.entries()) {
    const amount = positiveMoney(installment.amount, "Each installment must be greater than zero.");
    if (!amount.ok) return amount;
    installments.push({
      label: installment.label || `Installment ${index + 1}`,
      dueDate: installment.dueDate,
      amount: amount.value,
    });
  }
  if (compareMoney(addMoney(installments.map((installment) => installment.amount)), priced.net) !== 0) {
    return fail("Installments must add up to the sale price after discount.");
  }
  return { ok: true as const, value: { listPrice: listPrice.value, discount, net: priced.net, installments } };
}

const paymentSchema = z.object({
  installmentId: z.string().uuid("Choose an installment."),
  amount: z.string().trim(),
  method: methodField,
  note: z.string().trim().max(500).optional().default(""),
  paidAt: z.string().trim().optional().default(""),
});

export function parsePayment(body: unknown) {
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the payment.");
  const amount = positiveMoney(parsed.data.amount, "Enter a payment amount greater than zero.");
  if (!amount.ok) return amount;
  const paidAt = parsePaidAt(parsed.data.paidAt);
  if (!paidAt.ok) return paidAt;
  return { ok: true as const, value: { ...parsed.data, amount: amount.value, paidAt: paidAt.value } };
}

function positiveMoney(value: string, message: string) {
  const amount = normalizeMoney(value);
  if (!amount || compareMoney(amount, "0.00") <= 0) return fail(message);
  return { ok: true as const, value: amount };
}

function parsePaidAt(value: string) {
  if (!value) return { ok: true as const, value: new Date() };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fail("Use a real payment date.");
  return { ok: true as const, value: date };
}

function validPhone(value: string) {
  if (!value) return true;
  if (!/^[0-9+\-().\s]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15;
}

function validEmail(value: string) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function fail(error: string) {
  return { ok: false as const, error };
}
