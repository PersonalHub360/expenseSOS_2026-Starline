import { useEffect, useState } from "react";
import { BarChart3, Building2, CircleDollarSign, FileDown, Printer, Receipt, UserRound, Users, Wallet } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { operationStatusLabels } from "@/lib/operations";
import { projectStatusLabels } from "@/lib/projects";
import { formatTimestamp, statusLabels } from "@/lib/sales";

type ReportColumn = { key: string; label: string; money?: boolean };
type ReportTotal = { key: string; label: string; value: string };
type ReportTable = {
  kind: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals: ReportTotal[];
};
type Catalog = {
  projects: { id: string; name: string }[];
  buyers: { id: string; name: string }[];
  categories: string[];
};
type AuditEntry = {
  id: string;
  action: string;
  subjectType: string;
  summary: string;
  at: string;
  actor: string;
};

const groups = [
  {
    title: "Sales",
    detail: "Collections and what buyers still owe.",
    items: [
      { id: "sales", label: "Sales and collections", detail: "Sales, receipts, and refunds", icon: Receipt },
      { id: "dues", label: "Buyer dues", detail: "Balances still to collect", icon: Users },
    ],
  },
  {
    title: "Costs",
    detail: "Spending, project cost, and payroll.",
    items: [
      { id: "expenses", label: "Expenses", detail: "Recorded project and office costs", icon: Receipt },
      { id: "projects", label: "Project budget", detail: "Budget against actual cost", icon: Building2 },
      { id: "salary", label: "Salary", detail: "Base, bonus, deduction, and net", icon: UserRound },
    ],
  },
  {
    title: "Money",
    detail: "Capital, cash movement, and profit.",
    items: [
      { id: "investments", label: "Investments", detail: "Capital in, returned, and due", icon: CircleDollarSign },
      { id: "cashflow", label: "Cash flow", detail: "Deposits, withdrawals, and transfers", icon: Wallet },
      { id: "profit", label: "Profit and loss", detail: "Collected money minus costs", icon: BarChart3 },
    ],
  },
] as const;

const filterUse: Record<string, { project?: boolean; buyer?: boolean; category?: boolean }> = {
  sales: { project: true, buyer: true },
  dues: { project: true, buyer: true },
  expenses: { project: true, category: true },
  investments: { project: true },
  projects: { project: true, category: true },
  profit: { project: true, category: true },
};

const statuses: Record<string, string[]> = {
  sales: ["open", "closed", "cancelled"],
  dues: ["open", "closed"],
  expenses: ["pending", "approved", "rejected", "void_pending", "void"],
  investments: ["received", "partial", "returned"],
  projects: ["planning", "active", "on_hold", "completed", "cancelled"],
  salary: ["scheduled", "paid"],
  cashflow: ["deposit", "withdrawal", "transfer_in", "transfer_out"],
  profit: ["approved", "void_pending", "pending", "rejected", "void"],
};

const extraLabels: Record<string, string> = {
  closed: "Closed",
  received: "Received",
  partial: "Partial",
  returned: "Returned",
  scheduled: "Scheduled",
  paid: "Paid",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

const totalTones = [
  "bg-[#eef2ff] text-[#312e81]",
  "bg-[#ecfdf5] text-[#065f46]",
  "bg-[#fff7ed] text-[#9a3412]",
  "bg-[#f5f3ff] text-[#5b21b6]",
  "bg-[#e0f2fe] text-[#075985]",
];

function labelOf(value: string) {
  return extraLabels[value] ?? operationStatusLabels[value] ?? projectStatusLabels[value as keyof typeof projectStatusLabels] ?? statusLabels[value] ?? value.replaceAll("_", " ");
}

function currentReport(kind: string) {
  for (const group of groups) {
    const item = group.items.find((entry) => entry.id === kind);
    if (item) return item;
  }
  return groups[0].items[0];
}

export function ReportsPage() {
  const { user } = useAuth();
  const [kind, setKind] = useState("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [catalog, setCatalog] = useState<Catalog>({ projects: [], buyers: [], categories: [] });
  const [report, setReport] = useState<ReportTable | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const allowed = can(user, "reports", "view");
  const uses = filterUse[kind] ?? {};
  const chosen = currentReport(kind);

  useEffect(() => {
    if (!allowed) return;
    api<Catalog>("/api/reports/catalog").then((result) => {
      if (result.ok) setCatalog(result.data);
    });
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    load(kind, { from, to, projectId, buyerId, category, status });
  }, [allowed]);

  function load(nextKind: string, filters: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const query = params.toString();
    api<{ report: ReportTable }>(`/api/reports/${nextKind}${query ? `?${query}` : ""}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setReport(result.data.report);
      }
    });
    api<{ entries: AuditEntry[] }>(`/api/audit${query ? `?${query}` : ""}`).then((result) => {
      if (result.ok) setAudit(result.data.entries);
    });
  }

  function choose(nextKind: string) {
    const nextUse = filterUse[nextKind] ?? {};
    const filters = {
      from,
      to,
      projectId: nextUse.project ? projectId : "",
      buyerId: nextUse.buyer ? buyerId : "",
      category: nextUse.category ? category : "",
      status: "",
    };
    setKind(nextKind);
    setProjectId(filters.projectId);
    setBuyerId(filters.buyerId);
    setCategory(filters.category);
    setStatus("");
    load(nextKind, filters);
  }

  async function download(format: "csv" | "xls" | "pdf") {
    const params = new URLSearchParams({ format });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (projectId) params.set("projectId", projectId);
    if (buyerId) params.set("buyerId", buyerId);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    const response = await fetch(`/api/reports/${kind}?${params.toString()}`, { credentials: "include" });
    if (!response.ok) {
      setError("The export could not be downloaded.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind}-report.${format === "xls" ? "xls" : format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to reports.</p>;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#1d4ed8] via-[#4f46e5] to-[#0f766e] p-5 text-white shadow-[0_16px_40px_rgba(29,78,216,0.22)] print:hidden sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Operations</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reports</h1>
            <p className="mt-2 max-w-xl text-sm text-white/80">Pick one report, narrow the dates, then read the totals and the rows. Exports use the same filters.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="bg-white text-[#312e81] hover:bg-[#eef2ff]" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button type="button" className="bg-white/15 text-white hover:bg-white/25" onClick={() => void download("pdf")}>
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
            <Button type="button" className="bg-white/15 text-white hover:bg-white/25" onClick={() => void download("csv")}>
              CSV
            </Button>
            <Button type="button" className="bg-white/15 text-white hover:bg-white/25" onClick={() => void download("xls")}>
              Excel
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 print:hidden lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="rounded-[22px] border border-[#e4e9f2] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6366f1]">{group.title}</p>
            <p className="mt-1 text-sm text-[#64748b]">{group.detail}</p>
            <div className="mt-3 grid gap-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = kind === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => choose(item.id)}
                    className={`flex items-start gap-3 rounded-2xl px-3 py-3 text-left ${active ? "bg-[#312e81] text-white" : "bg-[#f8fafc] text-[#1e293b] hover:bg-[#eef2ff]"}`}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-white/15" : "bg-white text-[#4f46e5]"}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className={`mt-0.5 block text-xs ${active ? "text-white/75" : "text-[#64748b]"}`}>{item.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <form
        className="grid gap-3 rounded-[22px] border border-[#e4e9f2] bg-white p-4 print:hidden md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          load(kind, { from, to, projectId, buyerId, category, status });
        }}
      >
        <Field label="From" type="date" value={from} onChange={setFrom} />
        <Field label="To" type="date" value={to} onChange={setTo} />
        {uses.project ? <Select label="Project" value={projectId} onChange={setProjectId} options={catalog.projects.map((item) => ({ id: item.id, label: item.name }))} /> : null}
        {uses.buyer ? <Select label="Buyer" value={buyerId} onChange={setBuyerId} options={catalog.buyers.map((item) => ({ id: item.id, label: item.name }))} /> : null}
        {uses.category ? <Select label="Category" value={category} onChange={setCategory} options={catalog.categories.map((item) => ({ id: item, label: item }))} /> : null}
        <Select label="Status" value={status} onChange={setStatus} options={(statuses[kind] ?? []).map((item) => ({ id: item, label: labelOf(item) }))} />
        <div className="flex items-end">
          <Button type="submit" className="bg-[#312e81] hover:bg-[#1e1b4b]">
            Apply filters
          </Button>
        </div>
      </form>

      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      {report ? (
        <section className="rounded-[22px] border border-[#c7d2fe] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6366f1]">{chosen.label}</p>
              <h2 className="mt-1 text-xl font-semibold text-[#1e1b4b]">{report.title}</h2>
            </div>
            <p className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#3730a3]">{report.rows.length === 1 ? "1 row" : `${report.rows.length} rows`}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {report.totals.map((total, index) => (
              <p key={total.key} className={`rounded-2xl px-4 py-3 ${totalTones[index % totalTones.length]}`}>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">{total.label}</span>
                <span className="mt-1 block text-xl font-semibold">{formatTaka(total.value)}</span>
              </p>
            ))}
          </div>
          {report.rows.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">No rows in this range.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[#f8fafc] text-xs uppercase tracking-[0.12em] text-[#64748b]">
                  <tr>
                    {report.columns.map((column) => (
                      <th key={column.key} className={`px-3 py-3 font-semibold ${column.money ? "text-right" : ""}`}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, index) => (
                    <tr key={`${row.reference ?? row.project ?? row.employee ?? "row"}-${index}`} className="border-t border-[#eef2ff]">
                      {report.columns.map((column) => (
                        <td key={column.key} className={`px-3 py-3 text-[#1e293b] ${column.money ? "text-right font-semibold" : ""}`}>
                          {cellText(column, row[column.key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-[#7d8b96]">Loading report…</p>
      )}

      <section className="rounded-[22px] border border-[#ddd6fe] bg-white p-4 print:hidden sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold text-[#5b21b6]">Audit log</h2>
            <p className="mt-1 text-sm text-[#64748b]">Creates, changes, approvals, and deletions for the same date range. Notes, passwords, and file contents stay out.</p>
          </div>
          <p className="rounded-full bg-[#f5f3ff] px-3 py-1 text-xs font-semibold text-[#6d28d9]">{audit.length} entries</p>
        </div>
        {audit.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#faf8ff] px-4 py-8 text-center text-sm text-[#7d8b96]">No audit entries in this range.</p>
        ) : (
          <ul className="mt-4 max-h-[28rem] space-y-2 overflow-auto pr-1">
            {audit.map((entry) => (
              <li key={entry.id} className="rounded-2xl bg-[#faf8ff] px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#5b21b6]">{entry.actor}</span>
                  <span className="text-xs text-[#94a3b8]">{formatTimestamp(entry.at)}</span>
                </div>
                <p className="mt-1">
                  <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-xs font-semibold text-[#6d28d9]">{entry.action}</span>
                  <span className="ml-2 text-xs uppercase tracking-[0.08em] text-[#7c3aed]">{entry.subjectType}</span>
                </p>
                <p className="mt-1 text-[#334155]">{entry.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function cellText(column: ReportColumn, value: string) {
  if (column.money) return formatTaka(value || "0.00");
  if (column.key === "status" || column.key === "kind") return labelOf(value);
  return value;
}

function Field({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-[#e4eaee] bg-[#f8fafc] px-3" />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-[#e4eaee] bg-[#f8fafc] px-3">
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
