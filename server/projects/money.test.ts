import assert from "node:assert/strict";
import { test } from "node:test";
import { addMoney, compareMoney, normalizeMoney, subtractMoney } from "./money";
import { parseProject } from "./validate";

test("money keeps taka amounts exact", () => {
  assert.equal(normalizeMoney("8500000"), "8500000.00");
  assert.equal(normalizeMoney("10.5"), "10.50");
  assert.equal(normalizeMoney("10.555"), null);
  assert.equal(addMoney(["0.10", "0.20"]), "0.30");
  assert.equal(subtractMoney("1000.00", "250.50"), "749.50");
  assert.equal(subtractMoney("100.00", "150.00"), "-50.00");
  assert.equal(addMoney(["100.00", "-50.00"]), "50.00");
  assert.equal(compareMoney("0.10", "0.20"), -1);
  assert.equal(compareMoney("10.00", "10.00"), 0);
});

test("project details reject an end date before the start date", () => {
  const parsed = parseProject({
    name: "Abashik",
    location: "Anarkoli",
    startDate: "2026-05-01",
    endDate: "2026-04-01",
    budget: "1000",
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error, /end date/i);
});
