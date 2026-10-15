import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Download, FolderPlus, Plus, Upload } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { CategoryForm } from "@/components/operations/CategoryForm";
import { ExpenseForm } from "@/components/operations/ExpenseForm";
import { ExpenseImportForm } from "@/components/operations/ExpenseImportForm";
import { OperationStatus } from "@/components/operations/OperationStatus";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { downloadText } from "@/lib/download";
import { expensesToCsv } from "@/lib/expenseSheet";
import { formatTaka } from "@/lib/money";
import { formatTimestamp, methodLabel, type ExpenseRow } from "@/lib/operations";
import { cn } from "@/lib/utils";

type ListResponse = { expenses: ExpenseRow[]; total: string; pending: string };
type CategoryOption = { id: string | null; name: string };
type Catalog = { projects: { id: string; name: string }[]; categories: string[]; categoryOptions?: CategoryOption[] };

const statusFilters = [
  ["", "All"],
  ["pending", "Pending"],
  ["approved", "Recorded"],
  ["rejected", "Rejected"],
  ["void_pending", "Void pending"],
  ["void", "Void"],
] as const;

export function ExpensesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [total, setTotal] = useState("0.00");
  const [pendingTotal, setPendingTotal] = useState("0.00");
  const [catalog, setCatalog] = useState<Catalog>({ projects: [], categories: [] });
  const [panel, setPanel] = useState<"expenses" | "categories">("expenses");
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [importing, setImporting] = useState(false);
  const allowed = can(user, "expenses", "view");
  const canAdd = can(user, "expenses", "add");
  const canEdit = can(user, "expenses", "edit");

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

  function loadCatalog() {
    api<Catalog>("/api/expenses/catalog").then((result) => {
      if (result.ok) setCatalog(result.data);
    });
  }

  useEffect(() => {
    if (!allowed) return;
    loadCatalog();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, q, projectId, category, status, from, to]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to expenses.</p>;

  const options = catalog.categoryOptions ?? catalog.categories.map((name) => ({ id: null, name }));
  const counts = new Map<string, number>();
  for (const expense of rows ?? []) {
    const key = expense.category.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  async function removeCategory(option: CategoryOption) {
    if (!option.id) return;
    const result = await api(`/api/expenses/categories/${option.id}`, { method: "DELETE", body: "{}" });
    if (!result.ok) {
      setNotice("");
      setError(result.error);
    } else {
      setError("");
      setNotice("Category removed.");
      if (category.toLowerCase() === option.name.toLowerCase()) setCategory("");
      loadCatalog();
    }
  }

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#b45309] via-[#ea580c] to-[#db2777] p-5 text-white shadow-[0_16px_40px_rgba(180,83,9,0.22)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Finance</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Expenses</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Project and operating costs, categories, receipts, and amounts waiting for approval.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAdd ? (
              <Button className="bg-white text-[#9a3412] hover:bg-[#fff7ed]" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Record expense
              </Button>
            ) : null}
            {canAdd ? (
              <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setAddingCategory(true)}>
                <FolderPlus className="h-4 w-4" />
                Add category
              </Button>
            ) : null}
            {canAdd ? (
              <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setImporting(true)}>
                <Upload className="h-4 w-4" />
                Import
              </Button>
            ) : null}
            <Button
              className="bg-white/15 text-white hover:bg-white/25"
              onClick={() => downloadText("expenses.csv", expensesToCsv(rows ?? []))}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Shown" value={String(rows?.length ?? 0)} />
          <Stat label="Recorded" value={formatTaka(total)} />
          <Stat label="Pending" value={formatTaka(pendingTotal)} warn={pendingTotal !== "0.00"} />
          <Stat label="Categories" value={String(options.length)} />
        </dl>
      </header>

      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      <div className="flex gap-2">
        <TabButton active={panel === "expenses"} onClick={() => setPanel("expenses")} count={rows?.length ?? 0} tone="orange">
          Expenses
        </TabButton>
        <TabButton active={panel === "categories"} onClick={() => setPanel("categories")} count={options.length} tone="rose">
          Categories
        </TabButton>
      </div>

      {panel === "expenses" ? (
        <section className="overflow-hidden rounded-[24px] border border-[#fed7aa] bg-white shadow-[0_12px_32px_rgba(234,88,12,0.06)]">
          <div className="flex flex-col gap-3 border-b border-[#ffedd5] bg-[#fff7ed] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              {statusFilters.map(([id, label]) => (
                <button
                  key={id || "all"}
                  type="button"
                  aria-pressed={status === id}
                  onClick={() => setStatus(id)}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold", status === id ? "bg-[#9a3412] text-white" : "bg-white text-[#9a3412] ring-1 ring-[#fed7aa]")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <input className="h-11 rounded-xl border border-[#fed7aa] bg-white px-3 text-sm" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search description or category" aria-label="Search expenses" />
              <select className="h-11 rounded-xl border border-[#fed7aa] bg-white px-3 text-sm" value={projectId} aria-label="Filter by project" onChange={(event) => setProjectId(event.target.value)}>
                <option value="">All projects</option>
                {catalog.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select className="h-11 rounded-xl border border-[#fed7aa] bg-white px-3 text-sm" value={category} aria-label="Filter by category" onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {options.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
              <input className="h-11 rounded-xl border border-[#fed7aa] bg-white px-3 text-sm" type="date" value={from} aria-label="From date" onChange={(event) => setFrom(event.target.value)} />
              <input className="h-11 rounded-xl border border-[#fed7aa] bg-white px-3 text-sm" type="date" value={to} aria-label="To date" onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
          {rows === null ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">Loading expenses…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[#7d8b96]">No expenses match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.14em] text-[#9a3412]">
                  <tr>
                    {["Date", "Expense", "Project", "Paid from", "Amount", "Status"].map((label) => (
                      <th key={label} className="px-4 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((expense) => (
                    <tr key={expense.id} className="border-t border-[#ffedd5]">
                      <td className="px-4 py-3 text-[#7c2d12]">{formatTimestamp(expense.spentAt).slice(0, 11)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/expenses/${expense.id}`} className="font-semibold text-[#9a3412] hover:underline">
                          {expense.description || methodLabel(expense.method)}
                        </Link>
                        <p className="mt-0.5 text-xs text-[#c2410c]">
                          {expense.category}
                          {expense.hasReceipt ? " · Receipt" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[#7c2d12]">{expense.project?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-[#7c2d12]">
                        {expense.account?.name ?? "—"}
                        <span className="mt-0.5 block text-xs text-[#c2410c]">{methodLabel(expense.method)}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#9a3412]">{formatTaka(expense.amount)}</td>
                      <td className="px-4 py-3">
                        <OperationStatus value={expense.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-[24px] border border-[#fecdd3] bg-white p-4 shadow-[0_12px_32px_rgba(219,39,119,0.05)] sm:p-5">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#be185d]">Labels</p>
            <h2 className="text-lg font-semibold text-[#9f1239]">Categories</h2>
            <p className="mt-1 text-sm text-[#9f1239]/80">Counts follow the filters on the Expenses tab. Removing a label does not change recorded money.</p>
          </div>
          {options.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#7d8b96]">No categories yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {options.map((option) => {
                const count = counts.get(option.name.trim().toLowerCase()) ?? 0;
                return (
                  <article key={option.id ?? option.name} className="flex items-center justify-between gap-3 rounded-2xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3">
                    <div>
                      <h3 className="font-semibold text-[#9f1239]">{option.name}</h3>
                      <p className="mt-1 text-sm text-[#be185d]">
                        {count} in this list
                      </p>
                    </div>
                    {canEdit && option.id ? (
                      <button type="button" className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#9f1239] ring-1 ring-[#fecdd3]" onClick={() => void removeCategory(option)}>
                        Remove
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {creating ? (
        <ExpenseForm
          onClose={() => setCreating(false)}
          onSaved={(expense, warning) => {
            setCreating(false);
            const saved = expense.status === "pending" ? "Expense saved and waiting for approval." : "Expense recorded.";
            setNotice(warning ? `${saved} ${warning}` : saved);
            load();
            loadCatalog();
          }}
        />
      ) : null}
      {addingCategory ? (
        <CategoryForm
          onClose={() => setAddingCategory(false)}
          onSaved={() => {
            setAddingCategory(false);
            setNotice("Category saved.");
            setPanel("categories");
            loadCatalog();
          }}
        />
      ) : null}
      {importing ? (
        <ExpenseImportForm
          onClose={() => setImporting(false)}
          onRefresh={() => {
            load();
            loadCatalog();
          }}
          onDone={(message) => {
            setImporting(false);
            setNotice(message);
            load();
            loadCatalog();
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", warn ? "bg-[#ffe4e6] text-[#9f1239]" : "bg-white/15 text-white")}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  tone: "orange" | "rose";
  children: string;
}) {
  const on = tone === "orange" ? "bg-[#c2410c] text-white" : "bg-[#be185d] text-white";
  const chip = tone === "orange" ? "bg-[#fff7ed] text-[#c2410c]" : "bg-[#fff1f2] text-[#be185d]";
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold", active ? on : "bg-white text-[#334155] ring-1 ring-[#e2e8f0]")}>
      {children}
      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", active ? "bg-white/20" : chip)}>{count}</span>
    </button>
  );
}
