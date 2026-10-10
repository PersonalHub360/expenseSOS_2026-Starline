import { addDays } from "../expenses/dates";
import { compareMoney } from "../projects/money";

export const upcomingWindowDays = 14;

export type DeadlineKind = "overdue" | "upcoming" | "later";

export function deadlineKind(dueOn: string, today: string, windowDays = upcomingWindowDays): DeadlineKind {
  if (dueOn < today) return "overdue";
  if (dueOn <= addDays(today, windowDays)) return "upcoming";
  return "later";
}

export function stillDue(outstanding: string) {
  return compareMoney(outstanding, "0.00") > 0;
}
