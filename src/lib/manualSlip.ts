import { compareMoney, formatTaka, normalizeMoney } from "@/lib/money";
import type { PaymentMethod } from "@/lib/sales";

export type SlipKind = "payment" | "refund";

export type ManualSlip = {
  id: string;
  serial: string;
  kind: SlipKind;
  buyerName: string;
  buyerPhone: string;
  amount: string;
  method: PaymentMethod;
  issuedAt: string;
  note: string;
  projectName: string;
  unitNumber: string;
  completed: boolean;
  completedAt: string;
};

const STORAGE_KEY = "starline.manual.slips.v1";

export function loadManualSlips(): ManualSlip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ManualSlip>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((slip) => {
      if (!slip.id || !slip.serial || !slip.buyerName || !slip.buyerPhone || !slip.amount || !slip.method || !slip.issuedAt) return [];
      return [{
        id: slip.id,
        serial: slip.serial,
        kind: slip.kind === "refund" ? "refund" : "payment",
        buyerName: slip.buyerName,
        buyerPhone: slip.buyerPhone,
        amount: slip.amount,
        method: slip.method,
        issuedAt: slip.issuedAt,
        note: slip.note ?? "",
        projectName: slip.projectName ?? "",
        unitNumber: slip.unitNumber ?? "",
        completed: slip.completed === true,
        completedAt: typeof slip.completedAt === "string" ? slip.completedAt : "",
      }];
    });
  } catch {
    return [];
  }
}

export function saveManualSlip(slip: ManualSlip) {
  const slips = loadManualSlips().filter((item) => item.id !== slip.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([slip, ...slips]));
}

export function findManualSlip(id: string) {
  return loadManualSlips().find((slip) => slip.id === id) ?? null;
}

export function completeManualSlip(id: string) {
  const slip = findManualSlip(id);
  if (!slip || slip.completed) return slip;
  const completed = { ...slip, completed: true, completedAt: new Date().toISOString() };
  saveManualSlip(completed);
  return completed;
}

export function createSlipSerial(kind: SlipKind = "payment") {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const date = local.toISOString().slice(0, 10).replaceAll("-", "");
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${kind === "refund" ? "RF" : "SP"}-${date}-${hex}`;
}

export function manualSlipRows(slip: ManualSlip) {
  const rows = [
    { label: "Buyer", value: slip.buyerName },
    { label: "Phone", value: slip.buyerPhone },
    { label: "This receipt", value: formatTaka(slip.amount) },
    { label: "Method", value: slip.method },
  ];
  if (slip.projectName) rows.push({ label: "Project", value: slip.projectName });
  if (slip.unitNumber) rows.push({ label: "Unit", value: slip.unitNumber });
  if (slip.note) rows.push({ label: "Note", value: slip.note });
  return rows;
}

export function validSlipAmount(value: string) {
  const normalized = normalizeMoney(value);
  if (!normalized) return null;
  if (compareMoney(normalized, "0.00") <= 0) return null;
  return normalized;
}

export function validSlipPhone(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 6 || !/^[0-9+\-\s]+$/.test(trimmed)) return null;
  return trimmed;
}
