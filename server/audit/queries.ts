import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs, users } from "../db/schema";
import { parseCalendarDate } from "../expenses/dates";

export async function listAudit(from: string | null, to: string | null) {
  const conditions = [];
  if (from) conditions.push(sql`(${auditLogs.createdAt} at time zone 'UTC')::date >= ${from}::date`);
  if (to) conditions.push(sql`(${auditLogs.createdAt} at time zone 'UTC')::date <= ${to}::date`);
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      subjectType: auditLogs.subjectType,
      subjectId: auditLogs.subjectId,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
      actor: users.username,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(80);

  return rows.map((row) => ({
      id: row.id,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      summary: row.summary,
      at: row.createdAt.toISOString(),
      actor: row.actor ?? "Unknown",
    }));
}

export function parseAuditRange(query: Record<string, unknown>) {
  const fromText = typeof query.from === "string" ? query.from.trim() : "";
  const toText = typeof query.to === "string" ? query.to.trim() : "";
  const from = fromText ? parseCalendarDate(fromText) : null;
  const to = toText ? parseCalendarDate(toText) : null;
  if (fromText && !from) return { ok: false as const, error: "Use a real start date." };
  if (toText && !to) return { ok: false as const, error: "Use a real end date." };
  if (from && to && from > to) return { ok: false as const, error: "The start date must be on or before the end date." };
  return { ok: true as const, value: { from, to } };
}
