export const projectStatuses = ["planning", "active", "on_hold", "completed", "cancelled"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Ongoing",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type StaffMember = {
  id: string;
  name: string;
  jobTitle: string;
};

export type ProjectCore = {
  id: string;
  name: string;
  location: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  status: ProjectStatus;
  budget: string;
  staff: StaffMember[];
};

export type ProjectRecord = ProjectCore & {
  actualCost: string;
  variance: string;
  investment: string;
  revenue: string;
  damage: string;
  loss: string;
  netProfit: string;
  margin: string | null;
};

export function formatProjectDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
