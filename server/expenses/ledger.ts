import { addMoney, compareMoney, subtractMoney } from "../projects/money";
import { countsTowardBill, countsTowardCost } from "./policy";

export function expenseTotal(rows: { amount: string; status: string }[]) {
  return addMoney(rows.filter((row) => countsTowardCost(row.status)).map((row) => row.amount));
}

export function pendingTotal(rows: { amount: string; status: string }[]) {
  return addMoney(rows.filter((row) => row.status === "pending").map((row) => row.amount));
}

export function vendorOutstanding(
  bills: { amount: string; status: string }[],
  payments: { amount: string; status: string }[],
) {
  const billed = addMoney(bills.filter((bill) => countsTowardBill(bill.status)).map((bill) => bill.amount));
  const paid = addMoney(payments.filter((payment) => payment.status === "posted").map((payment) => payment.amount));
  return subtractMoney(billed, paid);
}

export function amountAvailable(billAmount: string, reserved: string[]) {
  return subtractMoney(billAmount, addMoney(reserved));
}

export function withinRemaining(amount: string, remaining: string) {
  return compareMoney(amount, remaining) <= 0 && compareMoney(amount, "0.00") > 0;
}
