export const paymentMethods = ["cash", "bank", "bkash", "nagad", "cheque"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  bkash: "bKash",
  nagad: "Nagad",
  cheque: "Cheque",
};

export const statusLabels: Record<string, string> = {
  open: "Open",
  converted: "Converted",
  cancelled: "Cancelled",
  closed: "Paid",
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

export const buyerDealStatuses = ["booking", "running", "completed", "cancelled"] as const;
export type BuyerDealStatus = (typeof buyerDealStatuses)[number];

export const buyerDealStatusLabels: Record<BuyerDealStatus, string> = {
  booking: "Booking",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const installmentSchedules = ["monthly", "yearly"] as const;
export type InstallmentSchedule = (typeof installmentSchedules)[number];

export const installmentScheduleLabels: Record<InstallmentSchedule, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
};

export type BuyerProfile = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  flatAmount: string;
  size: string;
  installmentPayment: string;
  installmentAmount: string;
  installmentSchedule: string;
  paymentAlertOn: string;
  dealStatus: string;
};

export type BuyerListItem = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  flatAmount: string;
  size: string;
  installmentPayment: string;
  installmentAmount: string;
  installmentSchedule: string;
  paymentAlertOn: string;
  dealStatus: string;
  bookings: number;
  openBookings: number;
  sales: number;
  openSales: number;
  received: string;
  outstanding: string;
  projects: string[];
};

export type BookingListItem = {
  id: string;
  reference: string;
  amount: string;
  status: "open" | "converted" | "cancelled";
  note: string;
  cancellationReason: string;
  bookedAt: string;
  cancelledAt: string | null;
  refunded: string;
  refundable: string;
  buyer: { id: string; name: string; phone: string };
  project: { id: string; name: string };
  unit: { id: string; number: string; type: string; price: string };
  sale: { id: string; reference: string } | null;
  receipt: { id: string; receiptNumber: string } | null;
};

export type SaleListItem = {
  id: string;
  reference: string;
  status: "open" | "closed" | "cancelled";
  listPrice: string;
  discount: string;
  net: string;
  received: string;
  outstanding: string;
  soldAt: string;
  buyer: { id: string; name: string; phone: string; email: string };
  project: { id: string; name: string };
  unit: { id: string; number: string };
  booking: { id: string; reference: string; amount: string } | null;
};

export type InstallmentRow = {
  id: string;
  sequence: number;
  label: string;
  dueDate: string;
  amount: string;
  received: string;
  outstanding: string;
};

export type SalePayment = {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  note: string;
  paidAt: string;
  allocations: { installmentId: string; sequence: number; amount: string }[];
};

export type SaleDetail = {
  sale: SaleListItem;
  installments: InstallmentRow[];
  payments: SalePayment[];
};

export type CatalogUnit = {
  id: string;
  number: string;
  type: string;
  price: string;
  status: string;
  projectId: string;
  projectName: string;
};

export type SalesSummary = {
  buyers: number | null;
  openBookings: number | null;
  openSales: number | null;
  collected: string | null;
  outstanding: string | null;
};

export type Receipt = {
  kind: "payment" | "refund";
  id: string;
  receiptNumber: string;
  issuedAt: string;
  amount: string;
  method: string;
  note: string;
  buyer: BuyerProfile;
  project: { id: string; name: string } | null;
  unit: { id: string; number: string; type: string } | null;
  booking: { id: string; reference: string; amount: string; status: string } | null;
  sale: { id: string; reference: string; listPrice: string; discount: string; net: string; status: string } | null;
  installments: { sequence: number; label: string; dueDate: string; applied: string }[];
  received: string;
  outstanding: string;
};

export function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function methodLabel(method: string) {
  return method in paymentMethodLabels ? paymentMethodLabels[method as PaymentMethod] : method;
}
