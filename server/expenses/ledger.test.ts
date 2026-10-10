import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { advanceDate } from "./dates";
import { inspectReceipt } from "./files";
import { amountAvailable, expenseTotal, vendorOutstanding, withinRemaining } from "./ledger";

test("expense total ignores pending, rejected, and void rows", () => {
  const total = expenseTotal([
    { amount: "10.10", status: "approved" },
    { amount: "20.20", status: "approved" },
    { amount: "5.00", status: "void_pending" },
    { amount: "50000.00", status: "pending" },
    { amount: "9.00", status: "rejected" },
    { amount: "3.00", status: "void" },
  ]);
  assert.equal(total, "35.30");
});

test("vendor outstanding uses open bills minus posted payments", () => {
  const outstanding = vendorOutstanding(
    [
      { amount: "1000.00", status: "open" },
      { amount: "60000.00", status: "pending" },
      { amount: "15.50", status: "void" },
      { amount: "40.00", status: "void_pending" },
    ],
    [
      { amount: "400.50", status: "posted" },
      { amount: "50000.00", status: "pending" },
      { amount: "10.00", status: "rejected" },
    ],
  );
  assert.equal(outstanding, "639.50");
  const remaining = amountAvailable("1000.00", ["400.50", "100.00"]);
  assert.equal(remaining, "499.50");
  assert.equal(withinRemaining("499.50", remaining), true);
  assert.equal(withinRemaining("499.51", remaining), false);
});

test("recurring dates stay on the calendar", () => {
  assert.equal(advanceDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(advanceDate("2024-01-31", "monthly"), "2024-02-29");
  assert.equal(advanceDate("2026-11-03", "quarterly"), "2027-02-03");
  assert.equal(advanceDate("2026-10-03", "yearly"), "2027-10-03");
});

test("receipt bytes must match an allowed type and size", () => {
  const pdf = Buffer.from("%PDF-1.4\n");
  const accepted = inspectReceipt({
    fileName: "cement.pdf",
    contentType: "application/pdf",
    data: pdf.toString("base64"),
  });
  assert.equal(accepted.ok, true);

  const disguised = inspectReceipt({
    fileName: "note.pdf",
    contentType: "application/pdf",
    data: Buffer.from("hello").toString("base64"),
  });
  assert.equal(disguised.ok, false);

  const script = inspectReceipt({
    fileName: "run.exe",
    contentType: "application/x-msdownload",
    data: Buffer.from("MZ").toString("base64"),
  });
  assert.equal(script.ok, false);

  const huge = inspectReceipt({
    fileName: "scan.pdf",
    contentType: "application/pdf",
    data: Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(1_500_001)]).toString("base64"),
  });
  assert.equal(huge.ok, false);
});

test("expense ledger does not use floating-point money", () => {
  const ledger = readFileSync(new URL("./ledger.ts", import.meta.url), "utf8");
  const commands = readFileSync(new URL("./commands.ts", import.meta.url), "utf8");
  for (const source of [ledger, commands]) {
    assert.equal(source.includes("parseFloat"), false);
    assert.equal(source.includes("Number("), false);
    assert.equal(source.includes("Math."), false);
  }
});
