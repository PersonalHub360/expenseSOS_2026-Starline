import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { monthKey, monthsBetween, netCollected, profitOf, sumColumn } from "./ledger";

test("report totals stay on integer cents", () => {
  assert.equal(netCollected("2500020.00", "5.00"), "2500015.00");
  assert.equal(profitOf("2500020.00", "126512.87"), "2373507.13");
  assert.equal(profitOf("10.00", "12.50"), "-2.50");
  assert.equal(sumColumn([{ amount: "10.10" }, { amount: "0.15" }], "amount"), "10.25");
  assert.equal(monthKey("2026-10-03"), "2026-10");
  assert.deepEqual(monthsBetween("2026-01", "2026-03"), ["2026-01", "2026-02", "2026-03"]);
});

test("report ledger does not use floating-point money", () => {
  const source = readFileSync(new URL("./ledger.ts", import.meta.url), "utf8");
  assert.equal(source.includes("parseFloat"), false);
  assert.equal(source.includes("Number("), false);
  assert.equal(source.includes("Math."), false);
});
