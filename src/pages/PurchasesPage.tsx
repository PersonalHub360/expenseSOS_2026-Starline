import { type FormEvent, useEffect, useState } from "react";
import { Link } from "wouter";
import { Pencil, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { PurchaseForm } from "@/components/operations/PurchaseForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { type AccountRow } from "@/lib/finance";
import { addMoney, formatTaka } from "@/lib/money";
import { formatTimestamp, methodLabel, operationStatusLabels, type ExpenseRow } from "@/lib/operations";

type PurchaseType = { id: string; name: string };

function typeOf(expense: ExpenseRow, types: PurchaseType[]) {
  const category = expense.category.trim().toLowerCase();
  return types.find((type) => type.name.trim().toLowerCase() === category) ?? null;
}

function counts(status: string) {
  return status === "approved" || status === "void_pending";
}

export function PurchasesPage() {
  const { user } = useAuth();
  const seeExpenses = can(user, "expenses", "view");
  const seeAccounts = can(user, "accounts", "view");
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [types, setTypes] = useState<PurchaseType[]>([]);
  const [lane, setLane] = useState("all");
  const [typeEditor, setTypeEditor] = useState<PurchaseType | "new" | null>(null);

  useEffect(() => {
    if (seeExpenses) {
      api<{ expenses: ExpenseRow[] }>("/api/expenses").then((result) => {
        if (!result.ok) setError(result.error);
        else setExpenses(result.data.expenses);
      });
    } else setExpenses([]);
    if (seeAccounts) {
      api<{ accounts: AccountRow[] }>("/api/accounts").then((result) => {
        if (result.ok) setAccounts(result.data.accounts);
      });
    } else setAccounts([]);
    if (seeExpenses) {
      api<{ purchaseTypes: PurchaseType[] }>("/api/expenses/catalog").then((result) => {
        if (result.ok) setTypes(result.data.purchaseTypes ?? []);
      });
    }
  }, [seeExpenses, seeAccounts]);

  if (!seeExpenses) return <p className="text-sm text-[#b42318]">You do not have access to purchases.</p>;

  const purchases = (expenses ?? []).filter((expense) => typeOf(expense, types));
  const recorded = purchases.filter((expense) => counts(expense.status));
  const pending = purchases.filter((expense) => expense.status === "pending");
  const visible = purchases.filter((expense) => lane === "all" || typeOf(expense, types)?.id === lane);
  const recordedTotal = recorded.length ? addMoney(recorded.map((expense) => expense.amount)) : "0.00";
  const pendingTotal = pending.length ? addMoney(pending.map((expense) => expense.amount)) : "0.00";
  const cashTotal = accounts?.length ? addMoney(accounts.map((account) => account.balance)) : "0.00";
  const otherCosts = (expenses ?? []).filter((expense) => !typeOf(expense, types) && counts(expense.status)).length;
  const selectedType = types.find((type) => type.id === lane);

  return (
    <div className="space-y-5">
      <header className="rounded-[28px] bg-[#9a3412] p-5 text-white shadow-[0_16px_40px_rgba(154,52,18,0.16)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Property purchases</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Purchase Management</h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">Land, materials, construction, legal work, and transport. Each one stays with a project and the account that pays it.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Summary label="Recorded purchases" value={formatTaka(recordedTotal)} detail={`${recorded.length} counted`} />
          <Summary label="Waiting approval" value={formatTaka(pendingTotal)} detail={`${pending.length} pending`} />
          <Summary label="Cash & bank" value={formatTaka(cashTotal)} detail="Available to pay from" />
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/80">Spent by type</h2>
            <p className="mt-1 text-sm text-white/70">Each head shows how much has been spent. Tap one to see only those records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lane !== "all" ? (
              <button type="button" onClick={() => setLane("all")} className="text-sm font-semibold text-white">
                Show all
              </button>
            ) : null}
            {can(user, "expenses", "add") ? (
              <button type="button" onClick={() => setTypeEditor("new")} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#9a3412]">
                Add type
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
          {types.map((item) => {
            const rows = recorded.filter((expense) => typeOf(expense, types)?.id === item.id);
            const total = rows.length ? addMoney(rows.map((expense) => expense.amount)) : "0.00";
            const bills = rows.map((expense) => expense.description.trim() || expense.category);
            const billLine = bills.length === 0 ? "No bills yet" : bills.length <= 2 ? bills.join(", ") : `${bills.slice(0, 2).join(", ")} +${bills.length - 2}`;
            const active = lane === item.id;
            return (
              <div key={item.id} className={`rounded-2xl p-3 text-left ${active ? "bg-white text-[#9a3412] ring-2 ring-[#fdba74]" : "bg-white/10 text-white"}`}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setLane(active ? "all" : item.id)} className="min-w-0 text-left text-xs font-semibold">
                    {item.name}
                  </button>
                  {can(user, "expenses", "edit") ? (
                    <button type="button" aria-label={`Edit ${item.name}`} onClick={() => setTypeEditor(item)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${active ? "bg-[#fff7ed] text-[#9a3412]" : "bg-white/15 text-white"}`}>
                      <Pencil className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <button type="button" onClick={() => setLane(active ? "all" : item.id)} className="mt-3 block w-full text-left">
                  <p className="text-lg font-semibold leading-none">{formatTaka(total)}</p>
                  <p className={`mt-1 line-clamp-2 text-[11px] font-medium ${active ? "text-[#9a3412]" : "text-white"}`}>{billLine}</p>
                </button>
              </div>
            );
          })}
        </div>
      </header>

      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      <section className="rounded-[24px] border border-[#fed7aa] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[#1e1b4b]">{selectedType ? selectedType.name : "All purchase records"}</h2>
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
            <p className="py-8 text-center text-sm text-[#7d8b96]">No purchase recorded in this type yet.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[#ffedd5]">
              <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 bg-[#fff7ed] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c2410c] sm:grid">
                <span>Purchase</span>
                <span>Project</span>
                <span>Paid from</span>
                <span className="text-right">Amount</span>
              </div>
              <ul className="divide-y divide-[#ffedd5]">
                {visible.map((expense) => (
                  <li key={expense.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                    <div className="min-w-0">
                      <Link href={`/expenses/${expense.id}`} className="font-semibold text-[#9a3412] hover:underline">
                        {expense.description || expense.category}
                      </Link>
                      <p className="mt-0.5 text-xs text-[#9a3412]/80">
                        {expense.category} · {formatTimestamp(expense.spentAt).slice(0, 11)} · {methodLabel(expense.method)}
                      </p>
                    </div>
                    <p className="text-sm text-[#7c2d12]">{expense.project?.name ?? "No project"}</p>
                    <p className="text-sm text-[#7c2d12]">{expense.account?.name ?? "—"}</p>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold text-[#1e1b4b]">{formatTaka(expense.amount)}</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#c2410c]">{operationStatusLabels[expense.status] ?? expense.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </section>
      {adding ? (
        <PurchaseForm
          initialType={selectedType?.name}
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
      {typeEditor ? (
        <TypeNameDialog
          title={typeEditor === "new" ? "Add type" : "Edit type"}
          initial={typeEditor === "new" ? "" : typeEditor.name}
          submitLabel={typeEditor === "new" ? "Add type" : "Save type"}
          onClose={() => setTypeEditor(null)}
          onSubmit={async (name) => {
            const editing = typeEditor === "new" ? null : typeEditor;
            const result = editing
              ? await api<{ purchaseTypes: PurchaseType[] }>(`/api/expenses/purchase-types/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name }) })
              : await api<{ purchaseTypes: PurchaseType[] }>("/api/expenses/purchase-types", { method: "POST", body: JSON.stringify({ name }) });
            if (!result.ok) return result.error;
            setTypes(result.data.purchaseTypes ?? []);
            setTypeEditor(null);
            setNotice(editing ? "Purchase type updated." : "Purchase type added.");
            setError("");
            if (editing) {
              api<{ expenses: ExpenseRow[] }>("/api/expenses").then((reload) => {
                if (reload.ok) setExpenses(reload.data.expenses);
              });
            }
            return "";
          }}
        />
      ) : null}
    </div>
  );
}

function TypeNameDialog({
  title,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<string>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const message = await onSubmit(name);
    setPending(false);
    if (message) setError(message);
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form className="grid gap-3" onSubmit={save}>
        <p className="text-sm text-[#5c6b76]">This name is the head on the dashboard. Renaming it keeps the bills that already use it.</p>
        <label className="text-sm font-medium">
          Type name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="bg-[#c2410c] hover:bg-[#9a3412]" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-white/70">{detail}</p>
    </div>
  );
}

