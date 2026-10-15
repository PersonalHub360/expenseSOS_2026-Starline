import assert from "node:assert/strict";
import test from "node:test";
import { expensesToCsv, parseExpenseCsv } from "../../src/lib/expenseSheet.ts";
import { expenseMethod, parseExpenseImport } from "./validate.ts";

test("expense csv keeps quoted commas and ignores a status column", () => {
  const parsed = parseExpenseCsv(
    "Date,Category,Description,Amount,Method,Account,Project,Status\n2026-10-01,Materials,\"Cement, sand\",1250.50,cash,Petty cash,Lakeside Homes,approved\n",
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.description, "Cement, sand");
  assert.equal(parsed.rows[0]?.line, 2);
  assert.equal(parsed.rows[0]?.account, "Petty cash");
});

test("expense csv rejects a file without the account column", () => {
  const parsed = parseExpenseCsv("Date,Category,Description,Amount,Method,Project\n2026-10-01,Labor,Wages,10.00,cash,\n");
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.errors[0] ?? "", /account/i);
});

test("expense method accepts labels and keys", () => {
  assert.equal(expenseMethod("Bank transfer"), "bank");
  assert.equal(expenseMethod("cheque"), "cheque");
  assert.equal(expenseMethod("card"), null);
});

test("expense import stops at 100 rows", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    line: index + 2,
    date: "2026-10-01",
    category: "Materials",
    description: "",
    amount: "1.00",
    method: "cash",
    account: "Petty cash",
    project: "",
  }));
  const parsed = parseExpenseImport({ rows });
  assert.equal(parsed.ok, false);
});

test("expense export quotes descriptions that contain commas", () => {
  const csv = expensesToCsv([
    {
      spentAt: "2026-10-01T00:00:00.000Z",
      category: "Materials",
      description: "Cement, sand",
      amount: "10.00",
      method: "cash",
      account: { name: "Petty cash" },
      project: null,
      status: "approved",
    },
  ]);
  assert.match(csv, /"Cement, sand"/);
  assert.match(csv, /Petty cash/);
});
