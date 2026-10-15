import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { RecordFiles } from "@/components/files/RecordFiles";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { formatProjectDate, projectStatusLabels, type ProjectCore } from "@/lib/projects";
import { cn } from "@/lib/utils";

type MoneyRow = { id: string; amount: string; note: string };
type Detail = {
  project: ProjectCore;
  summary: {
    budget: string;
    actualCost: string;
    variance: string;
    invested: string;
    collected: string;
    revenue: string;
    damage: string;
    loss: string;
    netProfit: string;
    margin: string | null;
    counts: Record<"units" | "sales" | "payments" | "expenses" | "investments" | "documents", number>;
  };
  units: { id: string; number: string; type: string; status: string; price: string }[];
  sales: { id: string; reference: string; amount: string; status: string; buyerName: string; unitNumber: string }[];
  payments: (MoneyRow & { method: string; paidAt: string; saleId: string | null })[];
  expenses: (MoneyRow & { category: string; spentAt: string; status?: string })[];
  investments: (MoneyRow & { investorName: string; investedAt: string })[];
  documents: { id: string; title: string; category: string; note: string; createdAt: string }[];
};

export function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<"expense" | "investment" | "document" | null>(null);
  const id = params.id ?? "";

  async function load() {
    const result = await api<Detail>(`/api/projects/${id}`);
    if (!result.ok) setError(result.error);
    else {
      setError("");
      setDetail(result.data);
    }
  }

  useEffect(() => {
    if (!id || !can(user, "projects", "view")) return;
    let active = true;
    api<Detail>(`/api/projects/${id}`).then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else setDetail(result.data);
    });
    return () => {
      active = false;
    };
  }, [id, user]);

  if (!can(user, "projects", "view")) {
    return <p className="text-sm text-[#b42318]">You do not have access to projects.</p>;
  }

  const project = detail?.project;
  const summary = detail?.summary;
  const overBudget = summary?.variance.startsWith("-") ?? false;
  const used = summary ? usagePercent(summary.actualCost, summary.budget) : 0;

  return (
    <div>
      <Link href="/properties" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#c4b5fd] bg-white px-4 text-sm font-semibold text-[#5b21b6] hover:bg-[#f5f3ff]">
        Properties/Units
      </Link>
      {project ? (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Project summary</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="mt-1 text-sm text-[#5c6b76]">
              {project.location} · {projectStatusLabels[project.status]} · {formatProjectDate(project.startDate)} –{" "}
              {formatProjectDate(project.endDate)}
            </p>
          </div>
          {can(user, "projects", "edit") ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit project
            </Button>
          ) : null}
        </div>
      ) : (
        <h1 className="mt-3 text-2xl font-semibold">{error ? "Project unavailable" : "Loading project…"}</h1>
      )}

      {notice ? <p role="status" className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      {project && summary ? (
        <>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-[#5c6b76]">
            {project.description || "No description yet."} Responsible staff:{" "}
            {project.staff.length
              ? project.staff.map((person) => (person.jobTitle ? `${person.name} (${person.jobTitle})` : person.name)).join(", ")
              : "not assigned."}
          </p>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard tone="sky" label="Start date" value={formatProjectDate(project.startDate)} detail={`Ends ${formatProjectDate(project.endDate)}`} />
            <SummaryCard tone="indigo" label="Budget" value={formatTaka(summary.budget)} />
            <SummaryCard tone="amber" label="Cost" value={formatTaka(summary.actualCost)} detail="Approved project expenses" />
            <SummaryCard tone="emerald" label="Revenue" value={formatTaka(summary.revenue)} detail="Sale price after discount" />
            <SummaryCard tone="violet" label="Investment" value={formatTaka(summary.invested)} detail="Principal recorded on this project" />
            <SummaryCard tone="rose" label="Damage" value={formatTaka(summary.damage)} detail="Approved expenses filed as damage" />
            <SummaryCard tone="rose" label="Loss" value={formatTaka(summary.loss)} detail="Cost above revenue" warn={summary.loss !== "0.00"} />
            <SummaryCard
              tone={summary.netProfit.startsWith("-") ? "rose" : "teal"}
              label="Net profit"
              value={formatTaka(summary.netProfit)}
              detail={summary.margin ? `Margin ${summary.margin}` : "No revenue yet, so there is no margin"}
              warn={summary.netProfit.startsWith("-")}
            />
            <SummaryCard
              tone={overBudget ? "rose" : "teal"}
              label={overBudget ? "Over budget" : "Remaining"}
              value={formatTaka(overBudget ? summary.variance.slice(1) : summary.variance)}
              detail={overBudget ? "Expenses are above the budget" : "Budget minus actual cost"}
              warn={overBudget}
            />
          </section>

          <div className="mt-4 rounded-[22px] border border-[#eef1f4] bg-white p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Budget used</span>
              <span className="text-[#5c6b76]">{summary.budget === "0.00" ? "Set a budget to compare" : `${used}%`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7eef0]">
              <div
                className={cn("h-full rounded-full", overBudget ? "bg-[#d14343]" : "bg-[#1a9a84]")}
                style={{ width: `${Math.min(used, 100)}%` }}
              />
            </div>
            <div className="mt-3 grid gap-2 text-sm text-[#5c6b76] sm:grid-cols-2">
              <p>Collected from linked sales: {formatTaka(summary.collected)}</p>
              <p>Invested: {formatTaka(summary.invested)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {can(user, "expenses", "add") ? <Button onClick={() => setDialog("expense")}>Record expense</Button> : null}
            {can(user, "investments", "add") ? (
              <Button variant="secondary" onClick={() => setDialog("investment")}>
                Record investment
              </Button>
            ) : null}
            {can(user, "projects", "edit") ? (
              <Button variant="secondary" onClick={() => setDialog("document")}>
                Add document
              </Button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Related
              title="Units"
              count={summary.counts.units}
              empty="No units are linked to this project yet."
              rows={detail.units.map((unit) => `${unit.number} · ${unit.type} · ${unit.status} · ${formatTaka(unit.price)}`)}
            />
            <Related
              title="Sales"
              count={summary.counts.sales}
              empty="Sales appear when a unit in this project is sold."
              rows={detail.sales.map((sale) => (
                <Link key={sale.id} href={`/sales/${sale.id}`} className="font-medium text-[#12786c] hover:underline">
                  {sale.reference} · {sale.unitNumber} · {sale.buyerName} · {formatTaka(sale.amount)}
                </Link>
              ))}
            />
            <Related
              title="Payments"
              count={summary.counts.payments}
              empty="Payments appear when they are recorded against a linked sale."
              rows={detail.payments.map((payment) => (
                <Link key={payment.id} href={`/payments/${payment.id}/receipt`} className="font-medium text-[#12786c] hover:underline">
                  {formatTaka(payment.amount)} · {payment.method}
                  {payment.note ? ` · ${payment.note}` : ""}
                </Link>
              ))}
            />
            <Related
              title="Expenses"
              count={summary.counts.expenses}
              empty="No expenses recorded. Actual cost stays at ৳0.00 until one is added."
              rows={detail.expenses.map((expense) => (
                <Link key={expense.id} href={`/expenses/${expense.id}`} className="font-medium text-[#12786c] hover:underline">
                  {formatTaka(expense.amount)} · {expense.category}
                  {expense.status && expense.status !== "approved" ? ` · ${expense.status.replaceAll("_", " ")}` : ""}
                  {expense.note ? ` · ${expense.note}` : ""}
                </Link>
              ))}
            />
            <Related
              title="Investments"
              count={summary.counts.investments}
              empty="No investments are linked to this project."
              rows={detail.investments.map((item) => `${item.investorName} · ${formatTaka(item.amount)}`)}
            />
            <Related
              title="Documents"
              count={summary.counts.documents}
              empty="No documents are attached."
              rows={detail.documents.map((document) => `${document.title} · ${document.category}`)}
            />
            <div className="xl:col-span-2">
              <RecordFiles subjectType="project" subjectId={id} module="projects" />
            </div>
          </div>
        </>
      ) : null}

      {editing && project ? (
        <ProjectForm
          project={project}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            setNotice("Project updated.");
            await load();
          }}
        />
      ) : null}
      {dialog && project ? (
        <RecordDialog
          kind={dialog}
          projectId={project.id}
          onClose={() => setDialog(null)}
          onSaved={async (message) => {
            setDialog(null);
            setNotice(message);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

const summaryTones = {
  sky: "border-[#bae6fd] bg-gradient-to-br from-[#f0f9ff] to-white",
  indigo: "border-[#c7d2fe] bg-gradient-to-br from-[#eef2ff] to-white",
  amber: "border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white",
  emerald: "border-[#a7f3d0] bg-gradient-to-br from-[#ecfdf5] to-white",
  violet: "border-[#ddd6fe] bg-gradient-to-br from-[#f5f3ff] to-white",
  rose: "border-[#fecdd3] bg-gradient-to-br from-[#fff1f2] to-white",
  teal: "border-[#99f6e4] bg-gradient-to-br from-[#f0fdfa] to-white",
} as const;

function SummaryCard({
  tone,
  label,
  value,
  detail,
  warn,
}: {
  tone: keyof typeof summaryTones;
  label: string;
  value: string;
  detail?: string;
  warn?: boolean;
}) {
  return (
    <section className={cn("rounded-[22px] border p-4", summaryTones[tone])}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", warn ? "text-[#be123c]" : "text-[#16302c]")}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-[#64748b]">{detail}</p> : null}
    </section>
  );
}

function Related({ title, count, empty, rows }: { title: string; count: number; empty: string; rows: ReactNode[] }) {
  return (
    <section className="rounded-[22px] border border-[#eef1f4] bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs font-semibold text-[#7d8b96]">{count}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#7d8b96]">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-[#334047]">
          {rows.map((row, index) => (
            <li key={`${title}-${index}`} className="border-t border-[#f0f3f5] pt-2 first:border-t-0 first:pt-0">
              {row}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordDialog({
  kind,
  projectId,
  onClose,
  onSaved,
}: {
  kind: "expense" | "investment" | "document";
  projectId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const title = kind === "expense" ? "Record expense" : kind === "investment" ? "Record investment" : "Add document";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (kind !== "document" && !/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Enter an amount greater than zero, with up to 2 decimal places.");
      return;
    }
    if (!primary.trim()) {
      setError(kind === "investment" ? "Enter the investor name." : kind === "document" ? "Enter the document title." : "Enter an expense category.");
      return;
    }
    setPending(true);
    const path =
      kind === "expense"
        ? `/api/projects/${projectId}/expenses`
        : kind === "investment"
          ? `/api/projects/${projectId}/investments`
          : `/api/projects/${projectId}/documents`;
    const body =
      kind === "expense"
        ? { category: primary, amount, note: secondary }
        : kind === "investment"
          ? { investorName: primary, amount, note: secondary }
          : { title: primary, category: secondary || "general", note: "" };
    const result = await api(path, { method: "POST", body: JSON.stringify(body) });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(kind === "expense" ? "Expense recorded." : kind === "investment" ? "Investment recorded." : "Document added.");
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="text-sm font-medium">
          {kind === "investment" ? "Investor" : kind === "document" ? "Title" : "Category"}
          <input className={`${fieldClass} mt-1.5`} value={primary} onChange={(event) => setPrimary(event.target.value)} />
        </label>
        {kind === "document" ? (
          <label className="text-sm font-medium">
            Category
            <input className={`${fieldClass} mt-1.5`} value={secondary} onChange={(event) => setSecondary(event.target.value)} placeholder="general" />
          </label>
        ) : (
          <label className="text-sm font-medium">
            Amount (৳)
            <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
        )}
        {kind !== "document" ? (
          <label className="text-sm font-medium">
            Note
            <input className={`${fieldClass} mt-1.5`} value={secondary} onChange={(event) => setSecondary(event.target.value)} />
          </label>
        ) : null}
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function usagePercent(actual: string, budget: string) {
  const budgetCents = cents(budget);
  if (budgetCents <= 0n) return 0;
  const actualCents = cents(actual);
  return Number((actualCents * 100n) / budgetCents);
}

function cents(value: string) {
  const negative = value.startsWith("-");
  const [whole, fraction = "00"] = value.replace("-", "").split(".");
  const amount = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -amount : amount;
}
