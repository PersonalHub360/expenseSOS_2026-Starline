import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { netMargin, projectResult } from "./performance";

test("project result uses sale price, approved damage, and the shortfall", () => {
  const result = projectResult({
    cost: "150.00",
    sales: [
      { amount: "200.00", status: "closed" },
      { amount: "40.00", status: "cancelled" },
    ],
    expenses: [
      { amount: "25.00", status: "approved", category: "Site damage" },
      { amount: "10.00", status: "pending", category: "Damage" },
      { amount: "125.00", status: "approved", category: "Materials" },
    ],
  });
  assert.equal(result.revenue, "200.00");
  assert.equal(result.damage, "25.00");
  assert.equal(result.loss, "0.00");
  assert.equal(result.netProfit, "50.00");
  assert.equal(result.margin, "25.00%");
});

test("loss is the cost above revenue and the margin stays on cents", () => {
  const result = projectResult({
    cost: "80.00",
    sales: [{ amount: "50.00", status: "open" }],
    expenses: [],
  });
  assert.equal(result.loss, "30.00");
  assert.equal(result.netProfit, "-30.00");
  assert.equal(result.margin, "-60.00%");
  assert.equal(netMargin("-1.00", "0.00"), null);
  assert.equal(netMargin("1.00", "3.00"), "33.33%");
});

test("project performance does not use floating-point money", () => {
  const source = readFileSync(new URL("./performance.ts", import.meta.url), "utf8");
  assert.equal(/\b(parseFloat|Number|Math)\b/.test(source), false);
});
