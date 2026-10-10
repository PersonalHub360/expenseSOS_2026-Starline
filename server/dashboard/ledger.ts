import { addMoney, subtractMoney } from "../projects/money";
import { expenseTotal } from "../expenses/ledger";

export type DatedMoney = { amount: string; on: string };
export type DatedExpense = DatedMoney & { status: string; projectId: string | null };
export type DatedSale = DatedMoney & { status: string };

export function utcDay(value: Date | string) {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

export function inRange(day: string, from: string | null, to: string | null) {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function periodTotals(input: {
  sales: DatedSale[];
  payments: DatedMoney[];
  refunds: DatedMoney[];
  expenses: DatedExpense[];
  investments: DatedMoney[];
  from: string | null;
  to: string | null;
}) {
  const sales = addMoney(
    input.sales
      .filter((row) => row.status !== "cancelled" && inRange(row.on, input.from, input.to))
      .map((row) => row.amount),
  );
  const received = subtractMoney(
    addMoney(input.payments.filter((row) => inRange(row.on, input.from, input.to)).map((row) => row.amount)),
    addMoney(input.refunds.filter((row) => inRange(row.on, input.from, input.to)).map((row) => row.amount)),
  );
  const counted = input.expenses.filter((row) => inRange(row.on, input.from, input.to));
  const expenses = expenseTotal(counted);
  const projectCosts = expenseTotal(counted.filter((row) => row.projectId));
  const investments = addMoney(
    input.investments.filter((row) => inRange(row.on, input.from, input.to)).map((row) => row.amount),
  );
  return {
    sales,
    received,
    expenses,
    projectCosts,
    investments,
    profit: subtractMoney(received, expenses),
  };
}

export function buyerDues(sales: { status: string; outstanding: string }[]) {
  return addMoney(sales.filter((sale) => sale.status !== "cancelled").map((sale) => sale.outstanding));
}

export function monthlySeries(input: {
  sales: DatedSale[];
  expenses: DatedExpense[];
  from: string | null;
  to: string | null;
}) {
  const sales = new Map<string, string[]>();
  const expenses = new Map<string, DatedExpense[]>();
  for (const sale of input.sales) {
    if (sale.status === "cancelled" || !inRange(sale.on, input.from, input.to)) continue;
    const month = sale.on.slice(0, 7);
    sales.set(month, [...(sales.get(month) ?? []), sale.amount]);
  }
  for (const expense of input.expenses) {
    if (!inRange(expense.on, input.from, input.to)) continue;
    const month = expense.on.slice(0, 7);
    expenses.set(month, [...(expenses.get(month) ?? []), expense]);
  }
  const present = [...sales.keys(), ...expenses.keys()].sort();
  const start = input.from ? input.from.slice(0, 7) : present[0];
  const end = input.to ? input.to.slice(0, 7) : present[present.length - 1];
  if (!start || !end || start > end) return [];
  const months: { month: string; sales: string; expenses: string }[] = [];
  for (let month = start; month <= end; month = nextMonth(month)) {
    months.push({
      month,
      sales: addMoney(sales.get(month) ?? []),
      expenses: expenseTotal(expenses.get(month) ?? []),
    });
  }
  return months;
}

function nextMonth(month: string) {
  let year = BigInt(month.slice(0, 4));
  let part = BigInt(month.slice(5, 7)) + 1n;
  if (part === 13n) {
    part = 1n;
    year += 1n;
  }
  return `${year.toString().padStart(4, "0")}-${part.toString().padStart(2, "0")}`;
}
