import { eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { writeAudit } from "../audit/log";
import { requireAuth, type Principal } from "../auth/principal";
import { db } from "../db/client";
import { recordFiles } from "../db/schema";
import { canAccessFile, subjectExists, type FileSubject } from "./access";
import { getRecordFile, listRecordFiles } from "./queries";
import { inspectRecordFile, readRecordFile, removeRecordFile, storeRecordFile } from "./storage";
import { parseFileList, parseFileUpload } from "./validate";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const filesRouter = Router();

filesRouter.use(requireAuth);

filesRouter.get("/", async (req, res) => {
  const parsed = parseFileList(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const actor = principal(res);
  if (!canAccessFile(actor, parsed.value.subjectType, "view")) {
    res.status(403).json({ error: "You do not have access to these documents." });
    return;
  }
  if (!(await subjectExists(parsed.value.subjectType, parsed.value.subjectId))) {
    res.status(404).json({ error: "Record not found." });
    return;
  }
  res.json({ files: await listRecordFiles(parsed.value.subjectType, parsed.value.subjectId) });
});

filesRouter.post("/", async (req, res) => {
  const parsed = parseFileUpload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const actor = principal(res);
  if (!canAccessFile(actor, parsed.value.subjectType, "edit")) {
    res.status(403).json({ error: "You do not have access to attach documents." });
    return;
  }
  if (!(await subjectExists(parsed.value.subjectType, parsed.value.subjectId))) {
    res.status(404).json({ error: "Record not found." });
    return;
  }
  const inspected = inspectRecordFile(parsed.value);
  if (!inspected.ok) {
    res.status(400).json({ error: inspected.error });
    return;
  }
  const storageKey = await storeRecordFile(inspected.value.bytes, inspected.value.extension);
  const [created] = await db
    .insert(recordFiles)
    .values({
      subjectType: parsed.value.subjectType,
      subjectId: parsed.value.subjectId,
      title: parsed.value.title,
      fileName: inspected.value.fileName,
      contentType: inspected.value.contentType,
      byteSize: inspected.value.bytes.length,
      storageKey,
      uploadedBy: actor.id,
    })
    .returning({ id: recordFiles.id });
  if (!created) throw new Error("Document was not stored.");
  await writeAudit({
    actorId: actor.id,
    action: "create",
    subjectType: "document",
    subjectId: created.id,
    summary: "Document stored",
  });
  const files = await listRecordFiles(parsed.value.subjectType, parsed.value.subjectId);
  res.status(201).json({ file: files.find((file) => file.id === created.id) });
});

filesRouter.get("/:id", async (req, res) => {
  const row = await loadAllowed(req, res, "view");
  if (!row) return;
  const bytes = await readRecordFile(row.storageKey);
  const name = row.fileName.replace(/[^\w.\- ]+/g, "") || "document";
  const inline = req.query.inline === "1" && row.contentType.startsWith("image/");
  res.setHeader("Content-Type", row.contentType);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${name}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(bytes);
});

filesRouter.delete("/:id", async (req, res) => {
  const row = await loadAllowed(req, res, "delete");
  if (!row) return;
  await db.delete(recordFiles).where(eq(recordFiles.id, row.id));
  await removeRecordFile(row.storageKey);
  await writeAudit({
    actorId: principal(res).id,
    action: "delete",
    subjectType: "document",
    subjectId: row.id,
    summary: "Document deleted",
  });
  res.json({ ok: true });
});

async function loadAllowed(req: Request, res: Response, action: "view" | "delete") {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Document not found." });
    return null;
  }
  const row = await getRecordFile(id);
  if (!row) {
    res.status(404).json({ error: "Document not found." });
    return null;
  }
  const actor = principal(res);
  if (!canAccessFile(actor, row.subjectType, action)) {
    res.status(403).json({ error: "You do not have access to this document." });
    return null;
  }
  if (!(await subjectExists(row.subjectType as FileSubject, row.subjectId))) {
    res.status(404).json({ error: "Record not found." });
    return null;
  }
  return row;
}

function principal(res: Response) {
  return res.locals.principal as Principal;
}

function routeId(req: Request) {
  const id = req.params.id;
  const value = Array.isArray(id) ? id[0] : id;
  return value && idPattern.test(value) ? value : "";
}
