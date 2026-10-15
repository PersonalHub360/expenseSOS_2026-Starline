export const accountKinds = ["cash", "bank"] as const;
export const movementKinds = ["deposit", "withdrawal"] as const;
export const employeeStatuses = ["active", "inactive"] as const;
export const salaryStatuses = ["scheduled", "paid"] as const;

export const investmentStatusLabels: Record<string, string> = {
  received: "Received",
  partial: "Partially returned",
  returned: "Returned",
};

export const accountKindLabels: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
};

export const movementLabels: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

export const salaryStatusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  paid: "Paid",
  active: "Active",
  inactive: "Inactive",
};

export type ProjectOption = { id: string; name: string };

export type InvestorOption = {
  id: string;
  name: string;
  phone: string;
  note: string;
  shareBps: number;
  createdAt: string;
};

export type InvestmentRow = {
  id: string;
  investorName: string;
  amount: string;
  purpose: string;
  method: string;
  note: string;
  reference: string;
  investedAt: string;
  project: ProjectOption | null;
  received: string;
  expectedReturn: string;
  returned: string;
  outstanding: string;
  payable: string;
  status: string;
};

export type InvestmentReturnRow = {
  id: string;
  amount: string;
  method: string;
  note: string;
  returnedAt: string;
};

export type AccountRow = {
  id: string;
  name: string;
  kind: string;
  accountNumber: string;
  note: string;
  isActive: boolean;
  balance: string;
};

export type AccountTxn = {
  id: string;
  kind: string;
  amount: string;
  note: string;
  occurredAt: string;
  transferGroup: string | null;
  counterAccount: { id: string; name: string } | null;
};

export type EmployeeRow = {
  id: string;
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  monthlySalary: string;
  status: string;
  joinedOn: string | null;
};

export type SalarySlipRow = {
  id: string;
  employeeId: string;
  period: string;
  baseSalary: string;
  bonus: string;
  deduction: string;
  advance: string;
  net: string;
  status: string;
  paidOn: string | null;
  note: string;
};

export type PayrollTotals = {
  base: string;
  bonus: string;
  deduction: string;
  advance: string;
  net: string;
};

export function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
