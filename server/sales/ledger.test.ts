import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { allocateAcrossInstallments, balanceAfter, installmentPosition, netPayable, outstandingOf } from "./ledger";
import { parseBooking, parseBuyer, parseSale } from "./validate";

const bookingId = "11111111-1111-4111-8111-111111111111";

test("sale balances stay exact across discount and installments", () => {
  const priced = netPayable("100000.00", "0.10");
  assert.equal(priced.ok, true);
  if (!priced.ok) return;
  assert.equal(priced.net, "99999.90");
  assert.equal(outstandingOf(priced.net, []).outstanding, "99999.90");
  const afterBooking = balanceAfter(priced.net, ["10000.10", "29999.90", "59999.90"], 1);
  assert.equal(afterBooking.received, "10000.10");
  assert.equal(afterBooking.outstanding, "89999.80");
  const afterFirst = balanceAfter(priced.net, ["10000.10", "29999.90", "59999.90"], 2);
  assert.equal(afterFirst.received, "40000.00");
  assert.equal(afterFirst.outstanding, "59999.90");
  const afterSecond = balanceAfter(priced.net, ["10000.10", "29999.90", "59999.90"], 3);
  assert.equal(afterSecond.received, "99999.90");
  assert.equal(afterSecond.outstanding, "0.00");
  assert.equal(outstandingOf("0.30", ["0.10", "0.20"]).outstanding, "0.00");
});

test("booking money is applied to installments in order", () => {
  const first = allocateAcrossInstallments("10000.10", [
    { id: "a", remaining: "40000.00" },
    { id: "b", remaining: "59999.90" },
  ]);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(first.parts, [{ id: "a", amount: "10000.10" }]);
  const positions = installmentPosition(
    [
      { id: "a", amount: "40000.00" },
      { id: "b", amount: "59999.90" },
    ],
    [{ installmentId: "a", amount: "10000.10" }],
  );
  assert.equal(positions[0]?.outstanding, "29999.90");
  assert.equal(positions[1]?.outstanding, "59999.90");
  const tooMuch = allocateAcrossInstallments("10.00", [{ id: "a", remaining: "4.00" }]);
  assert.equal(tooMuch.ok, false);
});

test("sale validation requires the installment schedule to match the net price", () => {
  const mismatch = parseSale({
    bookingId,
    listPrice: "1000.00",
    discount: "0.10",
    installments: [
      { dueDate: "2026-10-03", amount: "500.00" },
      { dueDate: "2026-11-03", amount: "500.00" },
    ],
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.match(mismatch.error, /installments/i);

  const priced = parseSale({
    bookingId,
    listPrice: "1000.00",
    discount: "0.10",
    installments: [
      { label: "Booking", dueDate: "2026-10-03", amount: "100.00" },
      { dueDate: "2026-11-03", amount: "899.90" },
    ],
  });
  assert.equal(priced.ok, true);
  if (priced.ok) assert.equal(priced.value.net, "999.90");
});

test("buyer and booking input is rejected when it is incomplete", () => {
  const buyer = parseBuyer({ name: "Rahim", phone: "12", email: "not-an-email" });
  assert.equal(buyer.ok, false);
  const booking = parseBooking({
    buyerId: bookingId,
    unitId: bookingId,
    amount: "0",
    method: "cash",
  });
  assert.equal(booking.ok, false);
});

test("sales code calculates money with integer cents", () => {
  const source = ["ledger.ts", "commands.ts", "queries.ts"]
    .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /parseFloat|\bNumber\(|Math\./);
  assert.match(source, /subtractMoney|addMoney|compareMoney/);
});
