import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { recordFiles } from "../db/schema";
import type { FileSubject } from "./access";

export async function listRecordFiles(subjectType: FileSubject, subjectId: string) {
  const rows = await db
    .select({
      id: recordFiles.id,
      title: recordFiles.title,
      fileName: recordFiles.fileName,
      contentType: recordFiles.contentType,
      byteSize: recordFiles.byteSize,
      createdAt: recordFiles.createdAt,
    })
    .from(recordFiles)
    .where(and(eq(recordFiles.subjectType, subjectType), eq(recordFiles.subjectId, subjectId)))
    .orderBy(desc(recordFiles.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getRecordFile(id: string) {
  const [row] = await db.select().from(recordFiles).where(eq(recordFiles.id, id)).limit(1);
  return row ?? null;
}
