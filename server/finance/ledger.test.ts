import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountBalance, investmentPosition, payrollTotals, salaryNet } from "./ledger";

test("investment position uses received, returned, and outstanding", () => {
  const partial = investmentPosition("1000.00", "150.50", ["400.25"]);
  assert.equal(partial.payable, "1150.50");
  assert.equal(partial.received, "1000.00");
  assert.equal(partial.returned, "400.25");
  assert.equal(partial.outstanding, "750.25");
  assert.equal(partial.status, "partial");

  const closed = investmentPosition("1000.00", "150.50", ["400.25", "750.25"]);
  assert.equal(closed.outstanding, "0.00");
  assert.equal(closed.status, "returned");

  const open = investmentPosition("1000.00", "0.00", []);
  assert.equal(open.status, "received");
  assert.equal(open.outstanding, "1000.00");
});

test("account balance is deposits and transfers in minus withdrawals and transfers out", () => {
  const balance = accountBalance([
    { kind: "deposit", amount: "1000.10" },
    { kind: "withdrawal", amount: "200.05" },
    { kind: "transfer_out", amount: "300.00" },
    { kind: "transfer_in", amount: "50.00" },
  ]);
  assert.equal(balance, "550.05");
  assert.equal(accountBalance([]), "0.00");
});

test("salary net and monthly totals stay in integer cents", () => {
  assert.equal(salaryNet("20000.00", "1500.50", "200.25", "300.00"), "21000.25");
  assert.equal(salaryNet("10000.00", "0.00", "0.00", "0.00"), "10000.00");
  assert.equal(salaryNet("10.00", "0.00", "10.01", "0.00"), null);
  const totals = payrollTotals([
    { baseSalary: "20000.00", bonus: "1500.50", deduction: "200.25", advance: "300.00" },
    { baseSalary: "10000.00", bonus: "0.00", deduction: "0.00", advance: "0.00" },
  ]);
  assert.deepEqual(totals, {
    base: "30000.00",
    bonus: "1500.50",
    deduction: "200.25",
    advance: "300.00",
    net: "31000.25",
  });
});

test("finance ledger does not use floating-point money", () => {
  const ledger = readFileSync(new URL("./ledger.ts", import.meta.url), "utf8");
  const commands = readFileSync(new URL("./commands.ts", import.meta.url), "utf8");
  for (const source of [ledger, commands]) {
    assert.equal(source.includes("parseFloat"), false);
    assert.equal(source.includes("Number("), false);
    assert.equal(source.includes("Math."), false);
  }
});
