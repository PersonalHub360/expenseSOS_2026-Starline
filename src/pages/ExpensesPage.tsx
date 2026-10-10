import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { ExpenseForm } from "@/components/operations/ExpenseForm";
import { OperationStatus } from "@/components/operations/OperationStatus";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { expenseStatuses, formatTimestamp, methodLabel, operationStatusLabels, type ExpenseRow } from "@/lib/operations";

type ListResponse = { expenses: ExpenseRow[]; total: string; pending: string };
type Catalog = { projects: { id: string; name: string }[]; categories: string[] };

export function ExpensesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [total, setTotal] = useState("0.00");
  const [pendingTotal, setPendingTotal] = useState("0.00");
  const [catalog, setCatalog] = useState<Catalog>({ projects: [], categories: [] });
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const allowed = can(user, "expenses", "view");

  function load() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (projectId) params.set("projectId", projectId);
    if (category.trim()) params.set("category", category.trim());
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    api<ListResponse>(`/api/expenses${query ? `?${query}` : ""}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setRows(result.data.expenses);
        setTotal(result.data.total);
        setPendingTotal(result.data.pending);
      }
    });
  }

  useEffect(() => {
    if (!allowed) return;
    api<Catalog>("/api/expenses/catalog").then((result) => {
      if (result.ok) setCatalog(result.data);
    });
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, q, projectId, category, status, from, to]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to expenses.</p>;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#b45309] via-[#ea580c] to-[#db2777] p-5 text-white shadow-[0_16px_40px_rgba(180,83,9,0.22)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Finance</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Expenses</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Project and operating costs, receipts, and amounts waiting for approval.</p>
          </div>
          {can(user, "expenses", "add") ? (
            <Button className="bg-white text-[#9a3412] hover:bg-[#fff7ed]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Record expense
            </Button>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-3 py-1">{rows?.length ?? 0} shown</span>
          <span className="rounded-full bg-[#ffedd5] px-3 py-1 text-[#9a3412]">Recorded {formatTaka(total)}</span>
          <span className="rounded-full bg-[#ffe4e6] px-3 py-1 text-[#9f1239]">Pending {formatTaka(pendingTotal)}</span>
        </div>
      </header>
      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      <section className="rounded-[22px] border border-[#fed7aa] bg-white p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)] sm:p-5">
        <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <input className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search" aria-label="Search expenses" />
          <select className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm" value={projectId} aria-label="Filter by project" onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All projects</option>
            {catalog.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <input className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm" value={category} list="filter-categories" onChange={(event) => setCategory(event.target.value)} placeholder="Category" aria-label="Filter by category" />
          <datalist id="filter-categories">
            {catalog.categories.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <select className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm" value={status} aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {expenseStatuses.map((item) => (
              <option key={item} value={item}>
                {operationStatusLabels[item]}
              </option>
            ))}
          </select>
          <input className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm" type="date" value={from} aria-label="From date" onChange={(event) => setFrom(event.target.value)} />
          <input className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm" type="date" value={to} aria-label="To date" onChange={(event) => setTo(event.target.value)} />
        </div>
        {rows === null ? (
          <p className="text-sm text-[#7d8b96]">Loading expenses…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#7d8b96]">No expenses match these filters.</p>
        ) : (
          <div className="grid gap-3">
            {rows.map((expense) => (
              <article key={expense.id} className="rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/expenses/${expense.id}`} className="font-semibold text-[#9a3412] hover:underline">
                      {expense.description || methodLabel(expense.method)}
                    </Link>
                    <p className="mt-1 text-sm text-[#7c2d12]">
                      {expense.category} · {formatTimestamp(expense.spentAt).slice(0, 11)} · {methodLabel(expense.method)}
                      {expense.account ? ` · ${expense.account.name}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-[#9a3412]">
                      {expense.project?.name ?? "No project"}
                      {expense.hasReceipt ? " · Receipt attached" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-[#9a3412]">{formatTaka(expense.amount)}</p>
                    <div className="mt-1"><OperationStatus value={expense.status} /></div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {creating ? (
        <ExpenseForm
          onClose={() => setCreating(false)}
          onSaved={(expense) => {
            setCreating(false);
            setNotice(expense.status === "pending" ? "Expense saved and waiting for approval." : "Expense recorded.");
            load();
          }}
        />
      ) : null}
    </div>
  );
}
