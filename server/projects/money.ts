const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/;

export function normalizeMoney(value: string) {
  const trimmed = value.trim();
  if (!moneyPattern.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function toCents(value: string) {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const normalized = normalizeMoney(negative ? trimmed.slice(1) : trimmed);
  if (!normalized) return null;
  const [whole, fraction] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  return negative ? -cents : cents;
}

export function fromCents(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function addMoney(values: string[]) {
  let total = 0n;
  for (const value of values) {
    const cents = toCents(value);
    if (cents === null) throw new Error("Invalid money value");
    total += cents;
  }
  return fromCents(total);
}

export function subtractMoney(left: string, right: string) {
  const leftCents = toCents(left);
  const rightCents = toCents(right);
  if (leftCents === null || rightCents === null) throw new Error("Invalid money value");
  return fromCents(leftCents - rightCents);
}

export function compareMoney(left: string, right: string) {
  const leftCents = toCents(left);
  const rightCents = toCents(right);
  if (leftCents === null || rightCents === null) throw new Error("Invalid money value");
  if (leftCents < rightCents) return -1;
  if (leftCents > rightCents) return 1;
  return 0;
}
