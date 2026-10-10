import { compareMoney } from "../projects/money";

export type HistoryKind = "note" | "booking" | "sale" | "payment" | "installment" | "due" | "refund";

export type HistoryEvent = {
  id: string;
  kind: HistoryKind;
  at: string;
  title: string;
  detail: string;
  amount: string | null;
  href: string | null;
};

type HistoryInput = {
  buyer: { notes: string; updatedAt: string };
  bookings: {
    id: string;
    reference: string;
    amount: string;
    status: string;
    note: string;
    cancellationReason: string;
    bookedAt: string;
    cancelledAt: string | null;
    projectName: string;
    unitNumber: string;
  }[];
  sales: {
    id: string;
    reference: string;
    net: string;
    status: string;
    soldAt: string;
    unitNumber: string;
  }[];
  payments: {
    id: string;
    receiptNumber: string;
    amount: string;
    method: string;
    note: string;
    paidAt: string;
    reference: string;
  }[];
  refunds: {
    id: string;
    receiptNumber: string;
    amount: string;
    note: string;
    refundedAt: string;
  }[];
  installments: {
    id: string;
    saleId: string;
    saleReference: string;
    label: string;
    dueDate: string;
    amount: string;
    outstanding: string;
  }[];
};

const kindOrder: Record<HistoryKind, number> = {
  booking: 0,
  sale: 1,
  installment: 2,
  due: 3,
  payment: 4,
  refund: 5,
  note: 6,
};

export function buyerHistory(input: HistoryInput) {
  const events: HistoryEvent[] = [];
  if (input.buyer.notes.trim()) {
    events.push({
      id: "note:buyer",
      kind: "note",
      at: input.buyer.updatedAt,
      title: "Buyer note",
      detail: input.buyer.notes.trim(),
      amount: null,
      href: null,
    });
  }
  for (const booking of input.bookings) {
    events.push({
      id: `booking:${booking.id}`,
      kind: "booking",
      at: booking.bookedAt,
      title: booking.reference,
      detail: `${booking.projectName} · ${booking.unitNumber} · ${booking.status}`,
      amount: booking.amount,
      href: "/sales",
    });
    if (booking.note.trim()) {
      events.push({
        id: `note:booking:${booking.id}`,
        kind: "note",
        at: booking.bookedAt,
        title: "Booking note",
        detail: booking.note.trim(),
        amount: null,
        href: null,
      });
    }
    if (booking.cancelledAt && booking.cancellationReason.trim()) {
      events.push({
        id: `note:cancel:${booking.id}`,
        kind: "note",
        at: booking.cancelledAt,
        title: "Cancellation note",
        detail: booking.cancellationReason.trim(),
        amount: null,
        href: null,
      });
    }
  }
  for (const sale of input.sales) {
    events.push({
      id: `sale:${sale.id}`,
      kind: "sale",
      at: sale.soldAt,
      title: sale.reference,
      detail: `${sale.unitNumber} · ${sale.status}`,
      amount: sale.net,
      href: `/sales/${sale.id}`,
    });
  }
  for (const payment of input.payments) {
    events.push({
      id: `payment:${payment.id}`,
      kind: "payment",
      at: payment.paidAt,
      title: payment.receiptNumber,
      detail: [payment.reference, payment.method].filter(Boolean).join(" · "),
      amount: payment.amount,
      href: `/payments/${payment.id}/receipt`,
    });
    if (payment.note.trim()) {
      events.push({
        id: `note:payment:${payment.id}`,
        kind: "note",
        at: payment.paidAt,
        title: "Payment note",
        detail: payment.note.trim(),
        amount: null,
        href: null,
      });
    }
  }
  for (const refund of input.refunds) {
    events.push({
      id: `refund:${refund.id}`,
      kind: "refund",
      at: refund.refundedAt,
      title: refund.receiptNumber,
      detail: "Refund",
      amount: refund.amount,
      href: `/payments/refunds/${refund.id}/receipt`,
    });
    if (refund.note.trim()) {
      events.push({
        id: `note:refund:${refund.id}`,
        kind: "note",
        at: refund.refundedAt,
        title: "Refund note",
        detail: refund.note.trim(),
        amount: null,
        href: null,
      });
    }
  }
  for (const installment of input.installments) {
    const at = `${installment.dueDate}T00:00:00.000Z`;
    events.push({
      id: `installment:${installment.id}`,
      kind: "installment",
      at,
      title: installment.label || "Installment",
      detail: `${installment.saleReference} · due ${installment.dueDate}`,
      amount: installment.amount,
      href: `/sales/${installment.saleId}`,
    });
    if (compareMoney(installment.outstanding, "0.00") > 0) {
      events.push({
        id: `due:${installment.id}`,
        kind: "due",
        at,
        title: "Amount due",
        detail: `${installment.saleReference} · ${installment.label || "Installment"}`,
        amount: installment.outstanding,
        href: `/sales/${installment.saleId}`,
      });
    }
  }
  return events.sort((left, right) => {
    if (left.at < right.at) return -1;
    if (left.at > right.at) return 1;
    return kindOrder[left.kind] - kindOrder[right.kind] || left.id.localeCompare(right.id);
  });
}
