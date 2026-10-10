import { addMoney, compareMoney, subtractMoney } from "../projects/money";

export type InvestmentStatus = "received" | "partial" | "returned";

export function investmentPosition(amount: string, expectedReturn: string, returnedAmounts: string[]) {
  const payable = addMoney([amount, expectedReturn]);
  const returned = addMoney(returnedAmounts);
  const outstanding = subtractMoney(payable, returned);
  let status: InvestmentStatus = "partial";
  if (compareMoney(outstanding, "0.00") === 0) status = "returned";
  else if (compareMoney(returned, "0.00") === 0) status = "received";
  return { received: amount, expectedReturn, returned, outstanding, payable, status };
}

export function accountBalance(rows: { kind: string; amount: string }[]) {
  const incoming = addMoney(rows.filter((row) => row.kind === "deposit" || row.kind === "transfer_in").map((row) => row.amount));
  const outgoing = addMoney(
    rows.filter((row) => row.kind === "withdrawal" || row.kind === "transfer_out").map((row) => row.amount),
  );
  return subtractMoney(incoming, outgoing);
}

export function salaryNet(base: string, bonus: string, deduction: string, advance: string) {
  const gross = addMoney([base, bonus]);
  const withheld = addMoney([deduction, advance]);
  if (compareMoney(withheld, gross) > 0) return null;
  return subtractMoney(gross, withheld);
}

export function payrollTotals(rows: { baseSalary: string; bonus: string; deduction: string; advance: string }[]) {
  return {
    base: addMoney(rows.map((row) => row.baseSalary)),
    bonus: addMoney(rows.map((row) => row.bonus)),
    deduction: addMoney(rows.map((row) => row.deduction)),
    advance: addMoney(rows.map((row) => row.advance)),
    net: addMoney(
      rows.map((row) => salaryNet(row.baseSalary, row.bonus, row.deduction, row.advance) ?? "0.00"),
    ),
  };
}
