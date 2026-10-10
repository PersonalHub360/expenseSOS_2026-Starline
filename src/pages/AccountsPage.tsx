import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { AccountForm, TransferForm } from "@/components/finance/AccountForms";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { accountKindLabels, type AccountRow } from "@/lib/finance";
import { addMoney, formatTaka } from "@/lib/money";

export function AccountsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [total, setTotal] = useState("0.00");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const allowed = can(user, "accounts", "view");

  function load() {
    api<{ accounts: AccountRow[]; total: string }>("/api/accounts").then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setRows(result.data.accounts);
        setTotal(result.data.total);
      }
    });
  }

  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to cash and bank accounts.</p>;

  const cash = addMoney((rows ?? []).filter((account) => account.kind === "cash").map((account) => account.balance));
  const bank = addMoney((rows ?? []).filter((account) => account.kind === "bank").map((account) => account.balance));

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#0369a1] via-[#0f766e] to-[#16a34a] p-5 text-white shadow-[0_16px_40px_rgba(3,105,161,0.22)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Finance</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Cash & bank</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Balances come from deposits, withdrawals, and transfers.</p>
          </div>
          {can(user, "accounts", "add") ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setTransferring(true)}>Transfer</Button>
              <Button className="bg-white text-[#0f766e] hover:bg-[#ecfdf5]" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Add account
              </Button>
            </div>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-3 py-1">{rows?.length ?? 0} accounts</span>
          <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[#065f46]">Cash {formatTaka(cash)}</span>
          <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[#1e3a8a]">Bank {formatTaka(bank)}</span>
          <span className="rounded-full bg-white px-3 py-1 text-[#0f766e]">Combined {formatTaka(total)}</span>
        </div>
      </header>
      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {rows === null ? (
        <p className="text-sm text-[#7d8b96]">Loading accounts…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[22px] bg-white px-4 py-10 text-center text-sm text-[#7d8b96]">No accounts yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((account) => {
            const cashAccount = account.kind === "cash";
            return (
              <article key={account.id} className={`rounded-[22px] border bg-white p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)] ${cashAccount ? "border-[#a7f3d0]" : "border-[#bfdbfe]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/accounts/${account.id}`} className="text-lg font-semibold text-[#0f766e] hover:underline">{account.name}</Link>
                    <p className="mt-1 text-sm text-[#475569]">{account.accountNumber || "No account number"}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cashAccount ? "bg-[#d1fae5] text-[#047857]" : "bg-[#dbeafe] text-[#1d4ed8]"}`}>
                    {accountKindLabels[account.kind] ?? account.kind}
                  </span>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${account.isActive ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#ffe4e6] text-[#be123c]"}`}>
                    {account.isActive ? "Active" : "Inactive"}
                  </span>
                  <p className="text-xl font-semibold text-[#0f172a]">{formatTaka(account.balance)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {creating ? (
        <AccountForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice("Account added.");
            load();
          }}
        />
      ) : null}
      {transferring && rows ? (
        <TransferForm
          accounts={rows}
          onClose={() => setTransferring(false)}
          onSaved={() => {
            setTransferring(false);
            setNotice("Transfer recorded.");
            load();
          }}
        />
      ) : null}
    </div>
  );
}
