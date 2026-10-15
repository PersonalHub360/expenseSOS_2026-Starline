export { methodLabel } from "@/lib/sales";

export const expenseCategories = ["Materials", "Labor", "Transport", "Utilities", "Office", "Other"] as const;
export const frequencies = ["monthly", "quarterly", "yearly"] as const;
export const vendorKinds = ["supplier", "contractor"] as const;
export const expenseStatuses = ["pending", "approved", "rejected", "void_pending", "void"] as const;

export type Frequency = (typeof frequencies)[number];
export type VendorKind = (typeof vendorKinds)[number];

export const operationStatusLabels: Record<string, string> = {
  pending: "Pending approval",
  approved: "Recorded",
  rejected: "Rejected",
  void_pending: "Void pending",
  void: "Void",
  open: "Open",
  posted: "Posted",
  supplier: "Supplier",
  contractor: "Contractor",
};

export const frequencyLabels: Record<Frequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export type ExpenseRow = {
  id: string;
  amount: string;
  category: string;
  description: string;
  method: string;
  status: string;
  frequency: Frequency | null;
  nextDueDate: string | null;
  spentAt: string;
  hasReceipt: boolean;
  requestedBy: string | null;
  project: { id: string; name: string } | null;
  vendor: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
};

export type ExpenseDetail = ExpenseRow & {
  receiptType: string;
  receiptBytes: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  approvalRequestedBy: string | null;
};

export type VendorRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  kind: VendorKind;
  outstanding: string;
  bills: number;
};

export type VendorProfile = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  kind: VendorKind;
};

export type VendorBill = {
  id: string;
  reference: string;
  description: string;
  amount: string;
  billDate: string;
  dueDate: string;
  status: string;
  requestedBy: string | null;
  decisionNote: string;
  outstanding: string;
  project: { id: string; name: string } | null;
};

export type VendorPayment = {
  id: string;
  billId: string;
  reference: string;
  amount: string;
  method: string;
  note: string;
  status: string;
  paidAt: string;
  requestedBy: string | null;
  decisionNote: string;
};

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}
