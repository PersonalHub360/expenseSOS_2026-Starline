import { z } from "zod";
import { normalizeMoney } from "./money";

export const projectStatuses = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

const dateField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value?.trim() || null)
  .refine((value) => value === null || isCalendarDate(value), "Use a real date.");

const staffMember = z.object({
  name: z.string().trim().min(1, "Enter the staff name.").max(120),
  jobTitle: z.string().trim().max(120).optional().default(""),
});

const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the project name.").max(160),
    location: z.string().trim().min(1, "Enter the location.").max(160),
    description: z.string().trim().max(2000).optional().default(""),
    startDate: dateField,
    endDate: dateField,
    status: z.enum(projectStatuses).default("planning"),
    budget: z.string().trim(),
    staffIds: z.array(z.string().uuid()).max(30).optional().default([]),
    staff: z.array(staffMember).max(20).optional().default([]),
  })
  .superRefine((value, context) => {
    if (!normalizeMoney(value.budget)) {
      context.addIssue({
        code: "custom",
        path: ["budget"],
        message: "Enter the budget in taka, with up to 2 decimal places.",
      });
    }
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date cannot be before the start date.",
      });
    }
  });

export type ProjectInput = z.infer<typeof projectSchema> & { budget: string };

export function parseProject(body: unknown) {
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the project details." };
  }
  const budget = normalizeMoney(parsed.data.budget);
  if (!budget) return { ok: false as const, error: "Enter the budget in taka, with up to 2 decimal places." };
  return { ok: true as const, value: { ...parsed.data, budget, staffIds: unique(parsed.data.staffIds) } };
}

const amountSchema = z.object({
  amount: z.string().trim(),
  note: z.string().trim().max(500).optional().default(""),
});

export function parseExpense(body: unknown) {
  const parsed = amountSchema
    .extend({ category: z.string().trim().min(1, "Enter an expense category.").max(80) })
    .safeParse(body);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the expense." };
  const amount = normalizeMoney(parsed.data.amount);
  if (!amount || amount === "0.00") {
    return { ok: false as const, error: "Enter an expense amount greater than zero." };
  }
  return { ok: true as const, value: { ...parsed.data, amount } };
}

export function parseInvestment(body: unknown) {
  const parsed = amountSchema
    .extend({ investorName: z.string().trim().min(1, "Enter the investor name.").max(160) })
    .safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the investment." };
  }
  const amount = normalizeMoney(parsed.data.amount);
  if (!amount || amount === "0.00") {
    return { ok: false as const, error: "Enter an investment amount greater than zero." };
  }
  return { ok: true as const, value: { ...parsed.data, amount } };
}

export function parseDocument(body: unknown) {
  const parsed = z
    .object({
      title: z.string().trim().min(1, "Enter the document title.").max(160),
      category: z.string().trim().max(80).optional().default("general"),
      note: z.string().trim().max(500).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the document." };
  return { ok: true as const, value: parsed.data };
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
