import { compareMoney, fromCents, normalizeMoney, subtractMoney, toCents } from "./money";

export const installmentYearChoices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function yearsFromSchedule(schedule: string) {
  return installmentYearChoices.find((choice) => String(choice) === schedule) ?? 0;
}

export type InstallmentPlan = {
  years: number;
  months: number;
  remaining: string;
  regular: string;
  last: string;
  uneven: boolean;
};

/** Monthly amount for the balance after downpayment. Uses integer cents. */
export function planInstallments(price: string, downpayment: string, years: number): InstallmentPlan | null {
  const normalizedPrice = normalizeMoney(price);
  const normalizedDown = normalizeMoney(downpayment);
  if (!normalizedPrice || !normalizedDown || !installmentYearChoices.includes(years as (typeof installmentYearChoices)[number])) return null;
  if (compareMoney(normalizedDown, "0.00") <= 0 || compareMoney(normalizedDown, normalizedPrice) > 0) return null;

  const remaining = subtractMoney(normalizedPrice, normalizedDown);
  if (compareMoney(remaining, "0.00") === 0) {
    return { years, months: 0, remaining, regular: "0.00", last: "0.00", uneven: false };
  }

  const cents = toCents(remaining);
  const months = years * 12;
  if (cents === null || cents <= 0n) return null;
  const regularCents = cents / BigInt(months);
  if (regularCents <= 0n) return null;
  const extra = cents % BigInt(months);
  return {
    years,
    months,
    remaining,
    regular: fromCents(regularCents),
    last: fromCents(regularCents + extra),
    uneven: extra !== 0n,
  };
}

export function saleSchedule(net: string, downpayment: string, years: number) {
  const plan = planInstallments(net, downpayment, years);
  if (!plan) return null;
  if (plan.months === 0) {
    return [{ label: "Downpayment", dueDate: isoDate(0), amount: downpaymentAmount(downpayment) ?? net }];
  }
  const down = downpaymentAmount(downpayment);
  if (!down) return null;
  const rows = [{ label: "Downpayment", dueDate: isoDate(0), amount: down }];
  for (let month = 1; month <= plan.months; month += 1) {
    rows.push({
      label: `Month ${month}`,
      dueDate: isoDate(30 * month),
      amount: month === plan.months ? plan.last : plan.regular,
    });
  }
  return rows;
}

export type NextBill = {
  monthly: string;
  next: string;
  added: string;
  reduced: string;
  left: string;
};

/**
 * Next collection after each payment.
 * A short payment is added to the following month. An extra payment is taken off the following months.
 * The result is a bill to collect. It does not change received money.
 */
export function nextInstallmentBill(input: {
  regular: string;
  last: string;
  months: number;
  payments: string[];
}): NextBill | null {
  const regular = toCents(input.regular);
  const last = toCents(input.last);
  if (regular === null || last === null || regular <= 0n || last <= 0n || !Number.isInteger(input.months) || input.months < 1) return null;

  const original: bigint[] = [];
  for (let index = 1; index < input.months; index += 1) original.push(regular);
  original.push(last);

  return billFromSchedule(regular, original, input.payments);
}

/** Apply dated payments onto a stored schedule, such as a sale's installment rows. */
export function nextBillOnSchedule(amounts: string[], payments: string[]): NextBill | null {
  const original: bigint[] = [];
  for (const amount of amounts) {
    const cents = toCents(amount);
    if (cents === null || cents <= 0n) return null;
    original.push(cents);
  }
  if (original.length === 0) return null;
  return billFromSchedule(original[0], original, payments);
}

export type InstallmentHistoryStep = {
  due: string;
  paid: string;
  next: string;
  shortfall: string;
  extra: string;
};

export function buyerInstallmentBill(buyer: {
  flatAmount: string;
  installmentPayment: string;
  installmentAmount: string;
  installmentSchedule: string;
  installmentPayments?: string[];
}): NextBill | null {
  const schedule = buyerSchedule(buyer);
  if (!schedule) return null;
  return nextInstallmentBill({ ...schedule, payments: buyer.installmentPayments ?? [] });
}

/** One row per monthly payment, in the same order, so the next bill can be checked later. */
export function installmentPaymentHistory(input: {
  regular: string;
  last: string;
  months: number;
  payments: string[];
}): InstallmentHistoryStep[] | null {
  const steps: InstallmentHistoryStep[] = [];
  for (let index = 0; index < input.payments.length; index += 1) {
    const before = nextInstallmentBill({ ...input, payments: input.payments.slice(0, index) });
    const after = nextInstallmentBill({ ...input, payments: input.payments.slice(0, index + 1) });
    const paid = normalizeMoney(input.payments[index] ?? "");
    if (!before || !after || !paid) return null;
    steps.push({
      due: before.next,
      paid,
      next: after.next,
      shortfall: compareMoney(before.next, paid) > 0 ? subtractMoney(before.next, paid) : "0.00",
      extra: compareMoney(paid, before.next) > 0 ? subtractMoney(paid, before.next) : "0.00",
    });
  }
  return steps;
}

export function buyerInstallmentHistory(buyer: {
  flatAmount: string;
  installmentPayment: string;
  installmentAmount: string;
  installmentSchedule: string;
  installmentPayments?: string[];
}): InstallmentHistoryStep[] | null {
  const schedule = buyerSchedule(buyer);
  if (!schedule) return null;
  return installmentPaymentHistory({ ...schedule, payments: buyer.installmentPayments ?? [] });
}

function buyerSchedule(buyer: {
  flatAmount: string;
  installmentPayment: string;
  installmentAmount: string;
  installmentSchedule: string;
}) {
  const years = yearsFromSchedule(buyer.installmentSchedule);
  const plan = years ? planInstallments(buyer.flatAmount, buyer.installmentPayment, years) : null;
  if (plan?.months) return { regular: plan.regular, last: plan.last, months: plan.months };
  const monthly = normalizeMoney(buyer.installmentAmount);
  if (!monthly || compareMoney(monthly, "0.00") <= 0) return null;
  return { regular: monthly, last: monthly, months: 120 };
}

function billFromSchedule(monthly: bigint, original: bigint[], payments: string[]) {
  const remaining = [...original];
  const short = original.map(() => false);
  for (const payment of payments) {
    const paid = toCents(payment);
    if (paid === null || paid <= 0n) return null;
    let leftToApply = paid;
    let started = -1;
    for (let index = 0; index < remaining.length && leftToApply > 0n; index += 1) {
      if (remaining[index] === 0n) continue;
      if (started < 0) started = index;
      const take = leftToApply < remaining[index] ? leftToApply : remaining[index];
      remaining[index] -= take;
      leftToApply -= take;
    }
    if (started >= 0) short[started] = remaining[started] > 0n;
  }
  return describeBill(monthly, original, remaining, short);
}

function describeBill(monthly: bigint, original: bigint[], remaining: bigint[], short = remaining.map(() => false)): NextBill {
  const left = remaining.reduce((sum, value) => sum + value, 0n);
  const open = remaining.findIndex((value) => value > 0n);
  if (open < 0) {
    return { monthly: fromCents(monthly), next: "0.00", added: "0.00", reduced: "0.00", left: "0.00" };
  }
  let next = remaining[open];
  let added = 0n;
  if (short[open] && open + 1 < remaining.length) {
    added = remaining[open];
    next += remaining[open + 1];
  }
  const reduced = !short[open] && remaining[open] < original[open] ? original[open] - remaining[open] : 0n;
  return {
    monthly: fromCents(monthly),
    next: fromCents(next),
    added: fromCents(added),
    reduced: fromCents(reduced),
    left: fromCents(left),
  };
}

function downpaymentAmount(value: string) {
  return normalizeMoney(value);
}

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
