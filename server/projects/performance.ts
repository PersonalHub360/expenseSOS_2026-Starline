import { countsTowardCost } from "../expenses/policy";
import { addMoney, compareMoney, subtractMoney, toCents } from "./money";

const zero = "0.00";

export function isDamageCategory(category: string) {
  return category.trim().toLowerCase().includes("damage");
}

/** Revenue is the sale price after discount. Cancelled sales are left out. Damage is the approved expense slice filed as damage, and it is already inside cost. */
export function projectResult(input: {
  sales: { amount: string; status: string }[];
  expenses: { amount: string; status: string; category: string }[];
  cost: string;
}) {
  const revenue = addMoney(input.sales.filter((sale) => sale.status !== "cancelled").map((sale) => sale.amount));
  const damage = addMoney(
    input.expenses
      .filter((expense) => countsTowardCost(expense.status) && isDamageCategory(expense.category))
      .map((expense) => expense.amount),
  );
  const netProfit = subtractMoney(revenue, input.cost);
  const loss = compareMoney(input.cost, revenue) > 0 ? subtractMoney(input.cost, revenue) : zero;
  return { revenue, damage, loss, netProfit, margin: netMargin(netProfit, revenue) };
}

/** Percent with two decimals, from integer cents. No rate when revenue is zero. */
export function netMargin(profit: string, revenue: string) {
  const profitCents = toCents(profit);
  const revenueCents = toCents(revenue);
  if (profitCents === null || revenueCents === null || revenueCents <= 0n) return null;
  const negative = profitCents < 0n;
  const absolute = negative ? -profitCents : profitCents;
  const basis = (absolute * 10000n + revenueCents / 2n) / revenueCents;
  const whole = basis / 100n;
  const fraction = (basis % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}%`;
}
