import { addMoney, subtractMoney } from "../projects/money";

export function netCollected(collected: string, refunded: string) {
  return subtractMoney(collected, refunded);
}

export function profitOf(received: string, expenses: string) {
  return subtractMoney(received, expenses);
}

export function monthKey(day: string) {
  return day.slice(0, 7);
}

export function monthsBetween(start: string, end: string) {
  if (!start || !end || start > end) return [];
  const months: string[] = [];
  for (let month = start; month <= end; month = nextMonth(month)) months.push(month);
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

export function sumColumn(rows: Record<string, string>[], key: string) {
  return addMoney(rows.map((row) => row[key] ?? "0.00"));
}
