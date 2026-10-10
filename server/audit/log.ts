import { db } from "../db/client";
import { auditLogs } from "../db/schema";

export type AuditAction = "create" | "update" | "approve" | "delete";

const summaryLimit = 160;

export async function writeAudit(entry: {
  actorId: string | null;
  action: AuditAction;
  subjectType: string;
  subjectId: string;
  summary: string;
}) {
  const summary = entry.summary.replace(/\s+/g, " ").trim().slice(0, summaryLimit);
  if (!summary || !entry.subjectId) return;
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    summary,
  });
}
