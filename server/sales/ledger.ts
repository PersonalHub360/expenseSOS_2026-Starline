import { addMoney, compareMoney, fromCents, subtractMoney, toCents } from "../projects/money";

export function netPayable(listPrice: string, discount: string) {
  if (compareMoney(listPrice, "0.00") <= 0) {
    return { ok: false as const, error: "Enter a sale price greater than zero." };
  }
  if (compareMoney(discount, "0.00") < 0) {
    return { ok: false as const, error: "Discount cannot be negative." };
  }
  if (compareMoney(discount, listPrice) > 0) {
    return { ok: false as const, error: "Discount cannot be more than the sale price." };
  }
  const net = subtractMoney(listPrice, discount);
  if (compareMoney(net, "0.00") <= 0) {
    return { ok: false as const, error: "The price after discount must be greater than zero." };
  }
  return { ok: true as const, net };
}

export function outstandingOf(net: string, amounts: string[]) {
  const received = addMoney(amounts);
  return { received, outstanding: subtractMoney(net, received) };
}

export function balanceAfter(net: string, orderedAmounts: string[], included: number) {
  if (included < 0 || included > orderedAmounts.length) throw new Error("Payment position is out of range");
  return outstandingOf(net, orderedAmounts.slice(0, included));
}

export type RemainingInstallment = { id: string; remaining: string };

export function allocateAcrossInstallments(amount: string, installments: RemainingInstallment[]) {
  const total = toCents(amount);
  if (total === null || total <= 0n) {
    return { ok: false as const, error: "Enter an amount greater than zero." };
  }
  let left = total;
  const parts: { id: string; amount: string }[] = [];
  for (const installment of installments) {
    if (left === 0n) break;
    const remaining = toCents(installment.remaining);
    if (remaining === null || remaining < 0n) {
      return { ok: false as const, error: "Installment balance is invalid." };
    }
    if (remaining === 0n) continue;
    const take = left < remaining ? left : remaining;
    parts.push({ id: installment.id, amount: fromCents(take) });
    left -= take;
  }
  if (left !== 0n) {
    return { ok: false as const, error: "The amount is greater than the remaining balance." };
  }
  return { ok: true as const, parts };
}

export function applyAllocation(installments: RemainingInstallment[], parts: { id: string; amount: string }[]) {
  return installments.map((installment) => {
    const part = parts.find((item) => item.id === installment.id);
    if (!part) return installment;
    return { ...installment, remaining: subtractMoney(installment.remaining, part.amount) };
  });
}

export function installmentPosition(
  installments: { id: string; amount: string }[],
  allocations: { installmentId: string; amount: string }[],
) {
  return installments.map((installment) => {
    const received = addMoney(
      allocations.filter((allocation) => allocation.installmentId === installment.id).map((allocation) => allocation.amount),
    );
    return {
      ...installment,
      received,
      outstanding: subtractMoney(installment.amount, received),
    };
  });
}
