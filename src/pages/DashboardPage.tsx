import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Banknote,
  Bell,
  Building2,
  CalendarClock,
  CircleAlert,
  Landmark,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka, toCents } from "@/lib/money";
import { formatProjectDate, projectStatuses, projectStatusLabels, type ProjectStatus } from "@/lib/projects";

type Notice = {
  id: string;
  kind: "overdue" | "upcoming" | "approval";
  title: string;
  detail: string;
  at: string;
  href: string;
  amount: string;
};

type DashboardReport = {
  range: { from: string | null; to: string | null };
  period: {
    sales: string;
    received: string;
    expenses: string;
    projectCosts: string;
    investments: string;
    profit: string;
  };
  current: { buyerDues: string; cashBalance: string };
  months: { month: string; sales: string; expenses: string }[];
  projects: {
    id: string;
    name: string;
    status: ProjectStatus;
    startDate: string | null;
    budget: string;
    actualCost: string;
    variance: string;
  }[];
  overdue: Notice[];
  pendingApprovals: Notice[];
  notifications: Notice[];
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function DashboardPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "" });
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState("");
  const allowed = can(user, "dashboard", "view");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const params = new URLSearchParams();
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    const query = params.toString();
    api<DashboardReport>(`/api/dashboard${query ? `?${query}` : ""}`).then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setReport(result.data);
      }
    });
    return () => {
      active = false;
    };
  }, [allowed, applied]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to the dashboard.</p>;

  const upcoming = report?.notifications.filter((item) => item.kind === "upcoming") ?? [];
  const profitLoss = report ? toCents(report.period.profit) : null;
  const profitTone = profitLoss !== null && profitLoss < 0n ? "loss" : "profit";

  const periodLabel = report ? rangeLabel(report.range.from, report.range.to) : rangeLabel(applied.from || null, applied.to || null);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[#d7ebe6] bg-gradient-to-r from-[#f3fbf8] via-white to-[#f4f7ff] p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">Dashboard</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[#16302c]">Overview</h1>
            <span className="rounded-full bg-[#0f766e] px-2.5 py-1 text-xs font-semibold text-white">{periodLabel}</span>
          </div>
          <p className="mt-1 text-sm text-[#5c6b76]">Sales, collections, and costs follow this range. Dues and cash stay current.</p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2 rounded-2xl bg-white/80 p-2 ring-1 ring-[#e4eeea]"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({ from, to });
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#93a0aa]">From</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-10 rounded-xl border border-[#e4eaee] bg-white px-3"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#93a0aa]">To</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-10 rounded-xl border border-[#e4eaee] bg-white px-3"
            />
          </label>
          <Button type="submit" size="sm">
            Apply
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
              setApplied({ from: "", to: "" });
            }}
          >
            Clear
          </Button>
        </form>
      </header>

      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {!report && !error ? <p className="text-sm text-[#7d8b96]">Loading dashboard…</p> : null}

      {report ? (
        <>
          <section>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                tone="sales"
                icon={TrendingUp}
                label="Total sales"
                value={report.period.sales}
                note="Sale price after discount"
              />
              <Stat
                tone="received"
                icon={Wallet}
                label="Received"
                value={report.period.received}
                note="Payments minus refunds"
              />
              <Stat
                tone="expenses"
                icon={Receipt}
                label="Expenses"
                value={report.period.expenses}
                note="Approved costs"
              />
              <Stat
                tone={profitTone}
                icon={TrendingUp}
                label="Profit / loss"
                value={report.period.profit}
                note="Received payments minus expenses"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                tone="investments"
                icon={Landmark}
                label="Investments"
                value={report.period.investments}
                note="Principal received"
              />
              <Stat
                tone="costs"
                icon={Building2}
                label="Project costs"
                value={report.period.projectCosts}
                note="Approved costs on a project"
              />
              <Stat
                tone="dues"
                icon={CircleAlert}
                label="Buyer dues"
                value={report.current.buyerDues}
                note="Current outstanding"
                badge="Now"
              />
              <Stat
                tone="cash"
                icon={Banknote}
                label="Cash & bank"
                value={report.current.cashBalance}
                note="Balance of every account"
                badge="Now"
              />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
            <section className="rounded-[24px] border border-[#e7eef2] bg-white p-5 shadow-[0_10px_28px_rgba(22,40,36,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#16302c]">Monthly movement</h2>
                  <p className="mt-1 text-sm text-[#7d8b96]">Sales against expenses, month by month.</p>
                </div>
                <div className="flex gap-3 text-xs font-medium text-[#5c6b76]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#4f46e5]" /> Sales
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" /> Expenses
                  </span>
                </div>
              </div>
              {report.months.length === 0 ? (
                <p className="mt-6 rounded-2xl bg-[#f8fafb] px-4 py-8 text-center text-sm text-[#7d8b96]">
                  No sales or expenses in this range.
                </p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {report.months.map((month) => (
                    <MonthRow key={month.month} month={month} max={chartMax(report.months)} />
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-[24px] bg-gradient-to-br from-[#16302c] to-[#0f4c45] p-5 text-white shadow-[0_16px_40px_rgba(15,76,69,0.22)]">
              <h2 className="text-lg font-semibold">Needs attention</h2>
              <p className="mt-1 text-sm text-white/70">Open items that are waiting on someone.</p>
              <div className="mt-5 space-y-3">
                <AttentionLink href="#overdue" label="Overdue payments" count={report.overdue.length} tone="rose" />
                <AttentionLink href="#approvals" label="Pending approvals" count={report.pendingApprovals.length} tone="amber" />
                <AttentionLink href="#upcoming" label="Due in 14 days" count={upcoming.length} tone="sky" />
              </div>
            </section>
          </div>

          <section className="rounded-[24px] border border-[#e7eef2] bg-white p-5 shadow-[0_10px_28px_rgba(22,40,36,0.04)]">
            <SectionHeading
              kicker="Portfolio"
              title="Project status"
              detail="Ongoing means a project is running. Every status stays visible."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {projectStatuses.map((status) => (
                <StatusLane
                  key={status}
                  status={status}
                  projects={report.projects.filter((project) => project.status === status)}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <NoticeList
              id="overdue"
              title="Overdue payments"
              empty="No overdue installments."
              items={report.overdue}
              tone="rose"
            />
            <NoticeList
              id="approvals"
              title="Pending approvals"
              empty="No approvals are waiting."
              items={report.pendingApprovals}
              tone="amber"
            />
            <NoticeList
              id="upcoming"
              title="Upcoming deadlines"
              empty="Nothing is due in the next 14 days."
              items={upcoming}
              tone="sky"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function SectionHeading({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">{kicker}</p>
      <h2 className="mt-1 text-lg font-semibold text-[#16302c]">{title}</h2>
      <p className="text-sm text-[#7d8b96]">{detail}</p>
    </div>
  );
}

const statTones = {
  sales: {
    card: "border-[#c7d2fe] bg-gradient-to-br from-[#eef2ff] to-white",
    icon: "bg-[#4f46e5] text-white",
    label: "text-[#4338ca]",
    value: "text-[#1e1b4b]",
    note: "text-[#6366f1]",
  },
  received: {
    card: "border-[#a7f3d0] bg-gradient-to-br from-[#ecfdf5] to-white",
    icon: "bg-[#059669] text-white",
    label: "text-[#047857]",
    value: "text-[#064e3b]",
    note: "text-[#10b981]",
  },
  expenses: {
    card: "border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white",
    icon: "bg-[#d97706] text-white",
    label: "text-[#b45309]",
    value: "text-[#78350f]",
    note: "text-[#d97706]",
  },
  profit: {
    card: "border-transparent bg-gradient-to-br from-[#0f766e] to-[#115e59] shadow-[0_14px_32px_rgba(15,118,110,0.22)]",
    icon: "bg-white/20 text-white",
    label: "text-white/80",
    value: "text-white",
    note: "text-white/70",
  },
  loss: {
    card: "border-transparent bg-gradient-to-br from-[#be123c] to-[#9f1239] shadow-[0_14px_32px_rgba(190,18,60,0.22)]",
    icon: "bg-white/20 text-white",
    label: "text-white/80",
    value: "text-white",
    note: "text-white/70",
  },
  investments: {
    card: "border-[#ddd6fe] bg-gradient-to-br from-[#f5f3ff] to-white",
    icon: "bg-[#7c3aed] text-white",
    label: "text-[#6d28d9]",
    value: "text-[#2e1065]",
    note: "text-[#8b5cf6]",
  },
  costs: {
    card: "border-[#99f6e4] bg-gradient-to-br from-[#f0fdfa] to-white",
    icon: "bg-[#0f766e] text-white",
    label: "text-[#0f766e]",
    value: "text-[#134e4a]",
    note: "text-[#14b8a6]",
  },
  dues: {
    card: "border-[#fecdd3] bg-gradient-to-br from-[#fff1f2] to-white",
    icon: "bg-[#e11d48] text-white",
    label: "text-[#be123c]",
    value: "text-[#881337]",
    note: "text-[#f43f5e]",
  },
  cash: {
    card: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    icon: "bg-[#2563eb] text-white",
    label: "text-[#1d4ed8]",
    value: "text-[#1e3a8a]",
    note: "text-[#3b82f6]",
  },
} as const;

function Stat({
  tone,
  icon: Icon,
  label,
  value,
  note,
  badge,
}: {
  tone: keyof typeof statTones;
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  badge?: string;
}) {
  const colors = statTones[tone];
  return (
    <article className={`rounded-[22px] border p-4 ${colors.card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${colors.label}`}>{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-2xl ${colors.icon}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${colors.value}`}>{formatTaka(value)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className={`text-xs ${colors.note}`}>{note}</p>
        {badge ? (
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#334047]">
            {badge}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function MonthRow({
  month,
  max,
}: {
  month: { month: string; sales: string; expenses: string };
  max: bigint;
}) {
  return (
    <li className="grid gap-2 sm:grid-cols-[92px_minmax(0,1fr)] sm:items-center">
      <p className="text-sm font-semibold text-[#334047]">{monthLabel(month.month)}</p>
      <div className="space-y-1.5">
        <Meter value={month.sales} max={max} bar="bg-[#4f46e5]" amount="text-[#312e81]" />
        <Meter value={month.expenses} max={max} bar="bg-[#f59e0b]" amount="text-[#92400e]" />
      </div>
    </li>
  );
}

function Meter({ value, max, bar, amount }: { value: string; max: bigint; bar: string; amount: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#f1f5f6]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: barWidth(value, max) }} />
      </div>
      <p className={`w-36 shrink-0 text-right text-xs font-semibold tabular-nums ${amount}`}>{formatTaka(value)}</p>
    </div>
  );
}

function AttentionLink({
  href,
  label,
  count,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  tone: "rose" | "amber" | "sky";
}) {
  const chip =
    tone === "rose" ? "bg-[#fb7185] text-white" : tone === "amber" ? "bg-[#fbbf24] text-[#78350f]" : "bg-[#7dd3fc] text-[#0c4a6e]";
  return (
    <a href={href} className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-3 transition hover:bg-white/15">
      <span className="text-sm font-medium">{label}</span>
      <span className="inline-flex items-center gap-2">
        <span className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-sm font-semibold ${chip}`}>{count}</span>
        <ArrowUpRight className="h-4 w-4 text-white/70" aria-hidden="true" />
      </span>
    </a>
  );
}

const statusLanes: Record<ProjectStatus, { hint: string; card: string; count: string }> = {
  planning: { hint: "Not started", card: "border-[#e2e8f0] bg-[#f8fafc]", count: "bg-[#64748b] text-white" },
  active: { hint: "Running", card: "border-[#99f6e4] bg-[#f0fdfa]", count: "bg-[#0f766e] text-white" },
  on_hold: { hint: "Paused", card: "border-[#fde68a] bg-[#fffbeb]", count: "bg-[#d97706] text-white" },
  completed: { hint: "Complete", card: "border-[#bfdbfe] bg-[#eff6ff]", count: "bg-[#2563eb] text-white" },
  cancelled: { hint: "Stopped", card: "border-[#fecdd3] bg-[#fff1f2]", count: "bg-[#e11d48] text-white" },
};

function StatusLane({
  status,
  projects,
}: {
  status: ProjectStatus;
  projects: { id: string; name: string; startDate: string | null }[];
}) {
  const tone = statusLanes[status];
  return (
    <article className={`rounded-2xl border p-3 ${tone.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[#16302c]">{projectStatusLabels[status]}</h3>
          <p className="text-xs text-[#64748b]">{tone.hint}</p>
        </div>
        <span className={`grid h-6 min-w-6 place-items-center rounded-full px-2 text-xs font-semibold ${tone.count}`}>
          {projects.length}
        </span>
      </div>
      {projects.length === 0 ? (
        <p className="mt-3 text-sm text-[#94a3b8]">None</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {projects.map((project) => (
            <li key={project.id} className="rounded-xl bg-white/80 px-2.5 py-2">
              <Link href={`/projects/${project.id}`} className="text-sm font-medium text-[#0f766e] hover:underline">
                {project.name}
              </Link>
              <p className="text-xs text-[#64748b]">Started {formatProjectDate(project.startDate)}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

const noticeTones = {
  rose: {
    card: "border-[#fecdd3] bg-gradient-to-b from-[#fff1f2] to-white",
    title: "text-[#9f1239]",
    count: "bg-[#e11d48] text-white",
  },
  amber: {
    card: "border-[#fde68a] bg-gradient-to-b from-[#fffbeb] to-white",
    title: "text-[#92400e]",
    count: "bg-[#d97706] text-white",
  },
  sky: {
    card: "border-[#bae6fd] bg-gradient-to-b from-[#f0f9ff] to-white",
    title: "text-[#075985]",
    count: "bg-[#0284c7] text-white",
  },
} as const;

function NoticeList({
  id,
  title,
  empty,
  items,
  tone,
}: {
  id: string;
  title: string;
  empty: string;
  items: Notice[];
  tone: keyof typeof noticeTones;
}) {
  const colors = noticeTones[tone];
  const Icon = tone === "rose" ? CircleAlert : tone === "amber" ? Bell : CalendarClock;
  return (
    <section id={id} className={`rounded-[24px] border p-4 ${colors.card}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={`inline-flex items-center gap-2 font-semibold ${colors.title}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          {title}
        </h2>
        <span className={`grid h-6 min-w-6 place-items-center rounded-full px-2 text-xs font-semibold ${colors.count}`}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-[#7d8b96]">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl bg-white/80 px-3 py-3 text-sm shadow-[0_1px_0_rgba(22,40,36,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={item.href} className="font-medium text-[#0f766e] hover:underline">
                  {item.title}
                </Link>
                <span className="font-semibold tabular-nums">{formatTaka(item.amount)}</span>
              </div>
              <p className="mt-1 text-[#5c6b76]">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function chartMax(months: { sales: string; expenses: string }[]) {
  let max = 0n;
  for (const month of months) {
    for (const value of [month.sales, month.expenses]) {
      const cents = toCents(value);
      if (cents !== null && cents > max) max = cents;
    }
  }
  return max;
}

function barWidth(value: string, max: bigint) {
  const cents = toCents(value);
  if (cents === null || cents <= 0n || max <= 0n) return "0%";
  return `${((cents * 100n) / max).toString()}%`;
}

function monthLabel(month: string) {
  const index = Number(month.slice(5, 7)) - 1;
  return `${monthNames[index] ?? month} ${month.slice(0, 4)}`;
}

function rangeLabel(from: string | null, to: string | null) {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "All dates";
}
