import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Building2, FileText, Hammer, Landmark, Plus, Scale, Truck, Wallet } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { PurchaseForm } from "@/components/operations/PurchaseForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { accountKindLabels, type AccountRow } from "@/lib/finance";
import { addMoney, formatTaka } from "@/lib/money";
import { formatTimestamp, methodLabel, operationStatusLabels, type ExpenseRow } from "@/lib/operations";
import { projectStatusLabels, type ProjectStatus } from "@/lib/projects";

type ProjectCard = { id: string; name: string; location: string; status: string };

const lanes = [
  {
    id: "land",
    title: "Land purchase",
    detail: "Plot price, filling, and mouza cost",
    icon: Landmark,
    tone: "bg-gradient-to-br from-[#7c3aed] to-[#6d28d9]",
    soft: "bg-[#f5f3ff] text-[#6d28d9]",
    match: /land|mouza|plot/i,
  },
  {
    id: "materials",
    title: "Materials",
    detail: "Cement, steel, bricks, and site supplies",
    icon: FileText,
    tone: "bg-gradient-to-br from-[#ea580c] to-[#f59e0b]",
    soft: "bg-[#fff7ed] text-[#c2410c]",
    match: /material|cement|steel|brick|sand|rod/i,
  },
  {
    id: "construction",
    title: "Construction",
    detail: "Labor, development, and site work",
    icon: Hammer,
    tone: "bg-gradient-to-br from-[#0284c7] to-[#0ea5e9]",
    soft: "bg-[#e0f2fe] text-[#0369a1]",
    match: /labor|labour|construct|develop|site work/i,
  },
  {
    id: "legal",
    title: "Legal & registration",
    detail: "Deed, mutation, and registration",
    icon: Scale,
    tone: "bg-gradient-to-br from-[#0f766e] to-[#14b8a6]",
    soft: "bg-[#ccfbf1] text-[#0f766e]",
    match: /legal|regist|deed|mutation|stamp/i,
  },
  {
    id: "transport",
    title: "Transport",
    detail: "Carrying materials and site movement",
    icon: Truck,
    tone: "bg-gradient-to-br from-[#be123c] to-[#fb7185]",
    soft: "bg-[#ffe4e6] text-[#be123c]",
    match: /transport|carrying|delivery/i,
  },
] as const;

type LaneId = (typeof lanes)[number]["id"];

function laneOf(expense: ExpenseRow) {
  const text = `${expense.category} ${expense.description}`;
  return lanes.find((lane) => lane.match.test(text)) ?? null;
}

function counts(status: string) {
  return status === "approved" || status === "void_pending";
}

export function PurchasesPage() {
  const { user } = useAuth();
  const seeExpenses = can(user, "expenses", "view");
  const seeProjects = can(user, "projects", "view");
  const seeAccounts = can(user, "accounts", "view");
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [projects, setProjects] = useState<ProjectCard[] | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [lane, setLane] = useState<LaneId | "all">("all");

  useEffect(() => {
    if (seeExpenses) {
      api<{ expenses: ExpenseRow[] }>("/api/expenses").then((result) => {
        if (!result.ok) setError(result.error);
        else setExpenses(result.data.expenses);
      });
    } else setExpenses([]);
    if (seeProjects) {
      api<{ projects: ProjectCard[] }>("/api/projects").then((result) => {
        if (result.ok) setProjects(result.data.projects);
      });
    } else setProjects([]);
    if (seeAccounts) {
      api<{ accounts: AccountRow[] }>("/api/accounts").then((result) => {
        if (result.ok) setAccounts(result.data.accounts);
      });
    } else setAccounts([]);
  }, [seeExpenses, seeProjects, seeAccounts]);

  if (!seeExpenses) return <p className="text-sm text-[#b42318]">You do not have access to purchases.</p>;

  const purchases = (expenses ?? []).filter((expense) => laneOf(expense));
  const recorded = purchases.filter((expense) => counts(expense.status));
  const pending = purchases.filter((expense) => expense.status === "pending");
  const visible = purchases.filter((expense) => lane === "all" || laneOf(expense)?.id === lane);
  const recordedTotal = recorded.length ? addMoney(recorded.map((expense) => expense.amount)) : "0.00";
  const pendingTotal = pending.length ? addMoney(pending.map((expense) => expense.amount)) : "0.00";
  const cashTotal = accounts?.length ? addMoney(accounts.map((account) => account.balance)) : "0.00";
  const otherCosts = (expenses ?? []).filter((expense) => !laneOf(expense) && counts(expense.status)).length;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#9a3412] via-[#c2410c] to-[#7c3aed] p-5 text-white shadow-[0_16px_40px_rgba(154,52,18,0.18)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Property purchases</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Purchase Management</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              Land, materials, construction, legal work, and transport. Each purchase stays tied to a project and the cash or bank account that pays it.
            </p>
          </div>
          {can(user, "expenses", "add") ? (
            <Button className="bg-white text-[#9a3412] hover:bg-[#fff7ed]" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add purchase
            </Button>
          ) : null}
        </div>
      </header>

      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}

      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <Stat label="Recorded purchases" value={formatTaka(recordedTotal)} detail={`${recorded.length} counted`} tone="bg-gradient-to-br from-[#ea580c] to-[#c2410c]" />
        <Stat label="Waiting approval" value={formatTaka(pendingTotal)} detail={`${pending.length} pending`} tone="bg-gradient-to-br from-[#d97706] to-[#f59e0b]" />
        <Stat label="Cash & bank" value={formatTaka(cashTotal)} detail="Available to pay from" tone="bg-gradient-to-br from-[#0f766e] to-[#14b8a6]" />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[#1e1b4b]">Purchase relations</h2>
        <p className="text-sm text-[#64748b]">Choose a part of the property purchase. Totals come from recorded expenses.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {lanes.map((item) => {
            const Icon = item.icon;
            const rows = recorded.filter((expense) => laneOf(expense)?.id === item.id);
            const total = rows.length ? addMoney(rows.map((expense) => expense.amount)) : "0.00";
            const active = lane === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLane(active ? "all" : item.id)}
                className={`rounded-2xl p-4 text-left text-white shadow-[0_10px_28px_rgba(76,29,149,0.08)] ${item.tone} ${active ? "ring-2 ring-[#1e1b4b] ring-offset-2" : ""}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <p className="mt-3 font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-white/80">{item.detail}</p>
                <p className="mt-3 text-lg font-semibold">{formatTaka(total)}</p>
                <p className="text-xs text-white/80">{rows.length} recorded</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Relation href="/projects" icon={Building2} title="Projects" detail={`${projects?.length ?? 0} projects receive these purchases`} className="bg-[#eef2ff] text-[#3730a3]" />
        <Relation href="/accounts" icon={Wallet} title="Paid from cash & bank" detail={`Available ${formatTaka(cashTotal)}`} className="bg-[#ecfdf5] text-[#047857]" />
      </section>

      <section className="rounded-[22px] border border-[#fed7aa] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#1e1b4b]">{lane === "all" ? "All purchase records" : lanes.find((item) => item.id === lane)?.title}</h2>
            <p className="text-sm text-[#64748b]">{visible.length} records{otherCosts ? ` · ${otherCosts} other costs stay in Expenses` : ""}</p>
          </div>
          {can(user, "expenses", "add") ? (
            <Button className="bg-[#c2410c] hover:bg-[#9a3412]" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add purchase
            </Button>
          ) : null}
        </div>
        {expenses === null ? (
          <p className="py-8 text-sm text-[#7d8b96]">Loading purchases…</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#7d8b96]">No purchase recorded in this relation yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#ffedd5]">
            {visible.map((expense) => (
              <li key={expense.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/expenses/${expense.id}`} className="font-semibold text-[#9a3412] hover:underline">
                    {expense.description || expense.category}
                  </Link>
                  <p className="mt-1 text-sm text-[#7c2d12]">
                    {expense.category} · {formatTimestamp(expense.spentAt).slice(0, 11)} · {methodLabel(expense.method)}
                    {expense.project ? ` · ${expense.project.name}` : ""}
                    {expense.account ? ` · ${expense.account.name}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[#1e1b4b]">{formatTaka(expense.amount)}</p>
                  <p className="mt-1 text-xs font-semibold text-[#c2410c]">{operationStatusLabels[expense.status] ?? expense.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Panel title="Projects" empty="No projects yet.">
          {projects === null ? <p className="text-sm text-[#94a3b8]">Loading projects…</p> : projects.map((project) => {
            const rows = recorded.filter((expense) => expense.project?.id === project.id);
            const total = rows.length ? addMoney(rows.map((expense) => expense.amount)) : "0.00";
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-[#eef2ff] px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold text-[#3730a3]">{project.name}</span>
                  <span className="mt-0.5 block text-xs text-[#6366f1]">{projectStatusLabels[project.status as ProjectStatus] ?? project.status}{project.location ? ` · ${project.location}` : ""}</span>
                </span>
                <span className="font-semibold text-[#312e81]">{formatTaka(total)}</span>
              </Link>
            );
          })}
        </Panel>
        <Panel title="Paid from" empty="No cash or bank account yet.">
          {accounts === null ? <p className="text-sm text-[#94a3b8]">Loading accounts…</p> : accounts.map((account) => (
            <Link key={account.id} href={`/accounts/${account.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-[#ecfdf5] px-3 py-2 text-sm">
              <span>
                <span className="font-semibold text-[#047857]">{account.name}</span>
                <span className="mt-0.5 block text-xs text-[#0f766e]">{accountKindLabels[account.kind] ?? account.kind}</span>
              </span>
              <span className="font-semibold text-[#065f46]">{formatTaka(account.balance)}</span>
            </Link>
          ))}
        </Panel>
      </section>
      {adding ? (
        <PurchaseForm
          initialType={lane === "all" ? undefined : lanes.find((item) => item.id === lane)?.title}
          onClose={() => setAdding(false)}
          onSaved={(_expense, warning) => {
            setAdding(false);
            setNotice(warning ?? "Purchase added.");
            setError("");
            if (seeExpenses) {
              api<{ expenses: ExpenseRow[] }>("/api/expenses").then((result) => {
                if (result.ok) setExpenses(result.data.expenses);
              });
            }
            if (seeAccounts) {
              api<{ accounts: AccountRow[] }>("/api/accounts").then((result) => {
                if (result.ok) setAccounts(result.data.accounts);
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <article className={`${tone} rounded-2xl p-4 text-white shadow-[0_12px_30px_rgba(154,52,18,0.12)]`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs text-white/80">{detail}</p>
    </article>
  );
}

function Relation({ href, icon: Icon, title, detail, className }: { href: string; icon: typeof Truck; title: string; detail: string; className: string }) {
  return (
    <Link href={href} className={`rounded-2xl px-4 py-4 ${className}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-80">{detail}</p>
    </Link>
  );
}

function Panel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <section className="rounded-[22px] border border-[#e9e4f5] bg-white p-4">
      <h2 className="font-semibold text-[#1e1b4b]">{title}</h2>
      <div className="mt-3 grid gap-2">{items.length ? items : <p className="text-sm text-[#94a3b8]">{empty}</p>}</div>
    </section>
  );
}
