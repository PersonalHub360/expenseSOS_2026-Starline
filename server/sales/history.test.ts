import assert from "node:assert/strict";
import { test } from "node:test";
import { buyerHistory } from "./history";

test("buyer history is chronological and a paid installment is not still due", () => {
  const history = buyerHistory({
    buyer: { notes: "Prefers weekend calls", updatedAt: "2026-10-03T08:00:00.000Z" },
    bookings: [
      {
        id: "booking-1",
        reference: "BK-1",
        amount: "10.00",
        status: "converted",
        note: "Booking money",
        cancellationReason: "",
        bookedAt: "2026-10-01T08:00:00.000Z",
        cancelledAt: null,
        projectName: "Abashik",
        unitNumber: "P8-01",
      },
      {
        id: "booking-2",
        reference: "BK-2",
        amount: "15.00",
        status: "cancelled",
        note: "",
        cancellationReason: "Buyer withdrew",
        bookedAt: "2026-10-02T08:00:00.000Z",
        cancelledAt: "2026-10-02T09:00:00.000Z",
        projectName: "Abashik",
        unitNumber: "P8-02",
      },
    ],
    sales: [
      {
        id: "sale-1",
        reference: "SL-1",
        net: "80.00",
        status: "open",
        soldAt: "2026-10-01T10:00:00.000Z",
        unitNumber: "P8-01",
      },
    ],
    payments: [
      {
        id: "pay-1",
        receiptNumber: "RC-1",
        amount: "10.00",
        method: "cash",
        note: "Cash received",
        paidAt: "2026-10-01T08:05:00.000Z",
        reference: "BK-1",
      },
    ],
    refunds: [
      {
        id: "refund-1",
        receiptNumber: "RF-1",
        amount: "5.00",
        note: "Partial refund",
        refundedAt: "2026-10-02T09:05:00.000Z",
      },
    ],
    installments: [
      {
        id: "inst-open",
        saleId: "sale-1",
        saleReference: "SL-1",
        label: "First",
        dueDate: "2020-01-01",
        amount: "80.00",
        outstanding: "70.00",
      },
      {
        id: "inst-paid",
        saleId: "sale-1",
        saleReference: "SL-1",
        label: "Second",
        dueDate: "2020-02-01",
        amount: "1.00",
        outstanding: "0.00",
      },
    ],
  });

  const times = history.map((event) => event.at);
  assert.deepEqual(times, [...times].sort((left, right) => left.localeCompare(right)));
  assert.deepEqual(
    [...new Set(history.map((event) => event.kind))].sort(),
    ["booking", "due", "installment", "note", "payment", "refund", "sale"],
  );
  assert.equal(history.filter((event) => event.kind === "due").length, 1);
  assert.equal(history.find((event) => event.kind === "due")?.amount, "70.00");
  assert.equal(history.find((event) => event.id === "installment:inst-paid")?.amount, "1.00");
  assert.equal(history.some((event) => event.id === "due:inst-paid"), false);
  const due = history.findIndex((event) => event.kind === "due");
  const installment = history.findIndex((event) => event.id === "installment:inst-open");
  assert.ok(installment >= 0 && installment < due);
  assert.equal(history[0]?.kind, "installment");
  assert.equal(history.at(-1)?.kind, "note");
});
