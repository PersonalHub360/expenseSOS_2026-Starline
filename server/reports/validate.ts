import { z } from "zod";
import { parseCalendarDate } from "../expenses/dates";

export const reportKinds = ["sales", "dues", "expenses", "investments", "projects", "salary", "cashflow", "profit"] as const;
export type ReportKind = (typeof reportKinds)[number];

const formats = ["json", "csv", "xls", "pdf"] as const;
export type ReportFormat = (typeof formats)[number];

export type ReportFilters = {
  from: string | null;
  to: string | null;
  projectId: string | null;
  buyerId: string | null;
  category: string | null;
  status: string | null;
  format: ReportFormat;
};

export function parseReportRequest(kind: string, query: Record<string, unknown>) {
  if (!reportKinds.includes(kind as ReportKind)) return { ok: false as const, error: "Choose a report." };
  const parsed = z
    .object({
      from: z.string().trim().optional().default(""),
      to: z.string().trim().optional().default(""),
      projectId: z.string().trim().optional().default(""),
      buyerId: z.string().trim().optional().default(""),
      category: z.string().trim().max(80).optional().default(""),
      status: z.string().trim().max(40).optional().default(""),
      format: z.enum(formats).optional().default("json"),
    })
    .safeParse({
      from: text(query.from),
      to: text(query.to),
      projectId: text(query.projectId),
      buyerId: text(query.buyerId),
      category: text(query.category),
      status: text(query.status),
      format: text(query.format) || "json",
    });
  if (!parsed.success) return { ok: false as const, error: "Check the report filters." };
  const from = parsed.data.from ? parseCalendarDate(parsed.data.from) : null;
  const to = parsed.data.to ? parseCalendarDate(parsed.data.to) : null;
  if (parsed.data.from && !from) return { ok: false as const, error: "Use a real start date." };
  if (parsed.data.to && !to) return { ok: false as const, error: "Use a real end date." };
  if (from && to && from > to) return { ok: false as const, error: "The start date must be on or before the end date." };
  if (parsed.data.projectId && !z.string().uuid().safeParse(parsed.data.projectId).success) {
    return { ok: false as const, error: "Choose a project." };
  }
  if (parsed.data.buyerId && !z.string().uuid().safeParse(parsed.data.buyerId).success) {
    return { ok: false as const, error: "Choose a buyer." };
  }
  return {
    ok: true as const,
    value: {
      kind: kind as ReportKind,
      filters: {
        from,
        to,
        projectId: parsed.data.projectId || null,
        buyerId: parsed.data.buyerId || null,
        category: parsed.data.category || null,
        status: parsed.data.status || null,
        format: parsed.data.format,
      } satisfies ReportFilters,
    },
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
