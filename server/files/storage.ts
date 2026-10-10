import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectReceipt } from "../expenses/files";

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/i;

export function recordFileDirectory() {
  return path.resolve(process.cwd(), "data", "record-files");
}

export function inspectRecordFile(input: { fileName: string; contentType: string; data: string }) {
  return inspectReceipt(input);
}

export async function storeRecordFile(bytes: Buffer, extension: string) {
  const key = `${randomUUID()}.${extension}`;
  const directory = recordFileDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(filePath(key), bytes);
  return key;
}

export async function readRecordFile(key: string) {
  return readFile(filePath(key));
}

export async function removeRecordFile(key: string | null) {
  if (!key) return;
  await unlink(filePath(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function filePath(key: string) {
  if (!keyPattern.test(key)) throw new Error("Invalid file key");
  const directory = recordFileDirectory();
  const full = path.resolve(directory, key);
  if (!full.startsWith(`${directory}${path.sep}`)) throw new Error("Invalid file key");
  return full;
}
