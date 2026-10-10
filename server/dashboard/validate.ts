import { z } from "zod";
import { parseCalendarDate } from "../expenses/dates";

export function parseDashboardRange(query: Record<string, unknown>) {
  const parsed = z
    .object({
      from: z.string().trim().optional().default(""),
      to: z.string().trim().optional().default(""),
    })
    .safeParse(query);
  if (!parsed.success) return fail("Use a real date range.");
  const from = parsed.data.from ? parseCalendarDate(parsed.data.from) : null;
  const to = parsed.data.to ? parseCalendarDate(parsed.data.to) : null;
  if (parsed.data.from && !from) return fail("Use a real start date.");
  if (parsed.data.to && !to) return fail("Use a real end date.");
  if (from && to && from > to) return fail("The start date must be on or before the end date.");
  return { ok: true as const, value: { from, to } };
}

function fail(error: string) {
  return { ok: false as const, error };
}
