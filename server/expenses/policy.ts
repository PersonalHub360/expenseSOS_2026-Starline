import { compareMoney } from "../projects/money";

/** Amounts at or above this need a second person's approval before they count. */
export const approvalThreshold = "50000.00";

export function needsApproval(amount: string) {
  return compareMoney(amount, approvalThreshold) >= 0;
}

export function countsTowardCost(status: string) {
  return status === "approved" || status === "void_pending";
}

export function countsTowardBill(status: string) {
  return status === "open" || status === "void_pending";
}
