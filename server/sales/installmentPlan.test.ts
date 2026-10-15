import assert from "node:assert/strict";
import test from "node:test";
import { addMoney } from "../projects/money";
import { installmentPaymentHistory, nextInstallmentBill, planInstallments, saleSchedule } from "../../src/lib/installmentPlan";
import { parseBuyer } from "./validate";

test("monthly installment splits the balance after downpayment in cents", () => {
  const plan = planInstallments("2500000.00", "500000.00", 4);
  assert.ok(plan);
  assert.equal(plan.months, 48);
  assert.equal(plan.remaining, "2000000.00");
  assert.equal(plan.regular, "41666.66");
  assert.equal(plan.last, "41666.98");
  assert.equal(plan.uneven, true);
});

test("a full downpayment leaves no installment", () => {
  const plan = planInstallments("80.00", "80.00", 1);
  assert.ok(plan);
  assert.equal(plan.months, 0);
  assert.equal(plan.remaining, "0.00");
});

test("a buyer year plan stores the monthly amount and not a ledger total", () => {
  const parsed = parseBuyer({
    name: "Rahim",
    flatAmount: "2500000",
    installmentPayment: "500000",
    installmentSchedule: "4",
    installmentAmount: "1.00",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.installmentAmount, "41666.66");
  assert.equal(parsed.value.flatAmount, "2500000.00");
});

test("a short monthly payment is added to the next bill", () => {
  const bill = nextInstallmentBill({ regular: "70000.00", last: "70000.00", months: 12, payments: ["50000.00"] });
  assert.ok(bill);
  assert.equal(bill.monthly, "70000.00");
  assert.equal(bill.next, "90000.00");
  assert.equal(bill.added, "20000.00");
  assert.equal(bill.reduced, "0.00");
});

test("an extra monthly payment is adjusted off the next bill", () => {
  const bill = nextInstallmentBill({ regular: "70000.00", last: "70000.00", months: 12, payments: ["90000.00"] });
  assert.ok(bill);
  assert.equal(bill.next, "50000.00");
  assert.equal(bill.reduced, "20000.00");
  assert.equal(bill.added, "0.00");
});

test("extra money keeps adjusting later months", () => {
  const bill = nextInstallmentBill({ regular: "70000.00", last: "70000.00", months: 12, payments: ["200000.00"] });
  assert.ok(bill);
  assert.equal(bill.next, "10000.00");
  assert.equal(bill.reduced, "60000.00");
});

test("a later short payment is added to the month after it", () => {
  const bill = nextInstallmentBill({ regular: "70000.00", last: "70000.00", months: 12, payments: ["70000.00", "50000.00"] });
  assert.ok(bill);
  assert.equal(bill.next, "90000.00");
  assert.equal(bill.added, "20000.00");
});

test("payment history keeps the bill due, the amount paid, and the next bill", () => {
  const history = installmentPaymentHistory({
    regular: "70000.00",
    last: "70000.00",
    months: 12,
    payments: ["50000.00", "90000.00"],
  });
  assert.ok(history);
  assert.deepEqual(history, [
    { due: "70000.00", paid: "50000.00", next: "90000.00", shortfall: "20000.00", extra: "0.00" },
    { due: "90000.00", paid: "90000.00", next: "70000.00", shortfall: "0.00", extra: "0.00" },
  ]);
});

test("sale schedule adds up to the flat price", () => {
  const rows = saleSchedule("1000.00", "100.00", 1);
  assert.ok(rows);
  assert.equal(rows.length, 13);
  assert.equal(addMoney(rows.map((row) => row.amount)), "1000.00");
});
