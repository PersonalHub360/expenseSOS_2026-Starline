import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const maxReceiptBytes = 1_500_000;

const allowed = {
  "image/jpeg": { extension: "jpg" },
  "image/png": { extension: "png" },
  "image/webp": { extension: "webp" },
  "application/pdf": { extension: "pdf" },
} as const;

export type ReceiptType = keyof typeof allowed;

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/i;

export function receiptDirectory() {
  return path.resolve(process.cwd(), "data", "expense-receipts");
}

export function inspectReceipt(input: { fileName: string; contentType: string; data: string }) {
  const contentType = input.contentType.trim().toLowerCase();
  const kind = allowed[contentType as ReceiptType];
  if (!kind) return { ok: false as const, error: "Upload a PDF, JPEG, PNG, or WebP receipt." };

  const encoded = input.data.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return { ok: false as const, error: "The receipt file is not valid." };
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0) return { ok: false as const, error: "The receipt file is empty." };
  if (bytes.length > maxReceiptBytes) {
    return { ok: false as const, error: "Receipts must be 1.5 MB or smaller." };
  }
  if (!matchesType(bytes, contentType as ReceiptType)) {
    return { ok: false as const, error: "File contents do not match the declared type." };
  }

  const cleaned = input.fileName.replace(/[^\w.\- ]+/g, "").trim().slice(0, 120);
  return {
    ok: true as const,
    value: {
      bytes,
      contentType: contentType as ReceiptType,
      extension: kind.extension,
      fileName: cleaned || `receipt.${kind.extension}`,
    },
  };
}

export async function storeReceipt(bytes: Buffer, extension: string) {
  const key = `${randomUUID()}.${extension}`;
  const directory = receiptDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(receiptPath(key), bytes);
  return key;
}

export async function readReceipt(key: string) {
  return readFile(receiptPath(key));
}

export async function removeReceipt(key: string | null) {
  if (!key) return;
  await unlink(receiptPath(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function receiptPath(key: string) {
  if (!keyPattern.test(key)) throw new Error("Invalid receipt key");
  const directory = receiptDirectory();
  const full = path.resolve(directory, key);
  if (!full.startsWith(`${directory}${path.sep}`)) throw new Error("Invalid receipt key");
  return full;
}

function matchesType(bytes: Buffer, contentType: ReceiptType) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (contentType === "image/webp") {
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return bytes.subarray(0, 4).toString("ascii") === "%PDF";
}
