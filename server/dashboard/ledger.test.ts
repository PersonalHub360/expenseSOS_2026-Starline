import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { addDays } from "../expenses/dates";
import { deadlineKind, stillDue } from "./deadlines";
import { buyerDues, monthlySeries, periodTotals } from "./ledger";

test("period totals follow sale, payment, expense, and investment records", () => {
  const totals = periodTotals({
    from: null,
    to: null,
    sales: [
      { amount: "99999.90", status: "closed", on: "2026-10-03" },
      { amount: "10.00", status: "cancelled", on: "2026-10-03" },
    ],
    payments: [
      { amount: "100.00", on: "2026-10-01" },
      { amount: "0.50", on: "2026-10-02" },
    ],
    refunds: [{ amount: "0.25", on: "2026-10-02" }],
    expenses: [
      { amount: "30.30", status: "approved", projectId: "project", on: "2026-10-01" },
      { amount: "20.20", status: "void_pending", projectId: null, on: "2026-10-02" },
      { amount: "50000.00", status: "pending", projectId: "project", on: "2026-10-02" },
      { amount: "9.00", status: "rejected", projectId: "project", on: "2026-10-02" },
    ],
    investments: [
      { amount: "1000.00", on: "2026-09-01" },
      { amount: "15.15", on: "2026-10-03" },
    ],
  });
  assert.equal(totals.sales, "99999.90");
  assert.equal(totals.received, "100.25");
  assert.equal(totals.expenses, "50.50");
  assert.equal(totals.projectCosts, "30.30");
  assert.equal(totals.investments, "1015.15");
  assert.equal(totals.profit, "49.75");

  const october = periodTotals({
    from: "2026-10-01",
    to: "2026-10-31",
    sales: [
      { amount: "80.00", status: "open", on: "2026-10-03" },
      { amount: "40.00", status: "open", on: "2026-09-30" },
    ],
    payments: [
      { amount: "10.00", on: "2026-10-03" },
      { amount: "5.00", on: "2026-09-01" },
    ],
    refunds: [{ amount: "1.00", on: "2026-10-04" }],
    expenses: [
      { amount: "7.07", status: "approved", projectId: null, on: "2026-10-03" },
      { amount: "3.00", status: "approved", projectId: "project", on: "2026-09-01" },
    ],
    investments: [{ amount: "1000.00", on: "2026-09-01" }],
  });
  assert.equal(october.sales, "80.00");
  assert.equal(october.received, "9.00");
  assert.equal(october.expenses, "7.07");
  assert.equal(october.projectCosts, "0.00");
  assert.equal(october.investments, "0.00");
  assert.equal(october.profit, "1.93");
  assert.equal(buyerDues([
    { status: "open", outstanding: "70.00" },
    { status: "cancelled", outstanding: "80.00" },
    { status: "closed", outstanding: "0.00" },
  ]), "70.00");
});

test("monthly chart sums equal the period totals", () => {
  const sales = [
    { amount: "10.10", status: "open", on: "2026-01-15" },
    { amount: "20.20", status: "closed", on: "2026-03-02" },
    { amount: "5.00", status: "cancelled", on: "2026-03-02" },
  ];
  const expenses = [
    { amount: "4.00", status: "approved", projectId: "project", on: "2026-01-20" },
    { amount: "1.50", status: "void", projectId: "project", on: "2026-03-02" },
    { amount: "2.25", status: "approved", projectId: null, on: "2026-03-18" },
  ];
  const months = monthlySeries({ sales, expenses, from: null, to: null });
  assert.deepEqual(months.map((month) => month.month), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(months[0]?.sales, "10.10");
  assert.equal(months[0]?.expenses, "4.00");
  assert.equal(months[1]?.sales, "0.00");
  assert.equal(months[1]?.expenses, "0.00");
  assert.equal(months[2]?.sales, "20.20");
  assert.equal(months[2]?.expenses, "2.25");
  const totals = periodTotals({ sales, payments: [], refunds: [], expenses, investments: [], from: null, to: null });
  assert.equal(add(months.map((month) => month.sales)), totals.sales);
  assert.equal(add(months.map((month) => month.expenses)), totals.expenses);
  assert.deepEqual(monthlySeries({ sales: [], expenses: [], from: "2020-01-01", to: "2020-02-01" }).map((month) => month.sales), [
    "0.00",
    "0.00",
  ]);
});

test("deadlines separate overdue payments from the next two weeks", () => {
  const today = "2026-10-03";
  assert.equal(deadlineKind("2026-10-02", today), "overdue");
  assert.equal(deadlineKind(today, today), "upcoming");
  assert.equal(deadlineKind(addDays(today, 14), today), "upcoming");
  assert.equal(deadlineKind(addDays(today, 15), today), "later");
  assert.equal(stillDue("0.01"), true);
  assert.equal(stillDue("0.00"), false);
});

test("dashboard ledger does not use floating-point money", () => {
  const source = readFileSync(new URL("./ledger.ts", import.meta.url), "utf8");
  assert.equal(source.includes("parseFloat"), false);
  assert.equal(source.includes("Number("), false);
  assert.equal(source.includes("Math."), false);
});

function add(values: string[]) {
  return periodTotals({
    sales: values.map((amount) => ({ amount, status: "open", on: "2026-01-01" })),
    payments: [],
    refunds: [],
    expenses: [],
    investments: [],
    from: null,
    to: null,
  }).sales;
}
