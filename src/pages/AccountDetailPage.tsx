import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/inventory/Dialog";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { accountKindLabels, formatWhen, movementKinds, movementLabels, type AccountRow, type AccountTxn } from "@/lib/finance";
import { formatTaka } from "@/lib/money";

export function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const id = params.id ?? "";
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [transactions, setTransactions] = useState<AccountTxn[]>([]);
  const [kind, setKind] = useState<(typeof movementKinds)[number]>("deposit");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  function load() {
    api<{ account: AccountRow; transactions: AccountTxn[] }>(`/api/accounts/${id}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setAccount(result.data.account);
        setTransactions(result.data.transactions);
      }
    });
  }

  useEffect(() => {
    if (id && can(user, "accounts", "view")) load();
  }, [id, user]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    const result = await api<{ account: AccountRow; transactions: AccountTxn[] }>(`/api/accounts/${id}/transactions`, {
      method: "POST",
      body: JSON.stringify({ kind, amount, occurredOn, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setAmount("");
    setNote("");
    setNotice(kind === "deposit" ? "Deposit recorded." : "Withdrawal recorded.");
    setAccount(result.data.account);
    setTransactions(result.data.transactions);
  }

  if (!can(user, "accounts", "view")) return <p className="text-sm text-[#b42318]">You do not have access to cash and bank accounts.</p>;
  if (error && !account) return <p className="text-sm text-[#b42318]">{error}</p>;
  if (!account) return <p className="text-sm text-[#7d8b96]">Loading account…</p>;

  return (
    <div>
      <Link href="/accounts" className="text-sm font-medium text-[#12786c] hover:underline">
        Cash & bank
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        <p className="mt-1 text-sm text-[#5c6b76]">
          {accountKindLabels[account.kind]} {account.accountNumber ? `· ${account.accountNumber}` : ""} · {account.isActive ? "Active" : "Inactive"}
        </p>
        <p className="mt-3 text-lg font-semibold">{formatTaka(account.balance)}</p>
      </div>
      {notice ? <p className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      <section className="mt-6 rounded-[22px] border border-[#eef1f4] bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold">Transaction history</h2>
        {transactions.length === 0 ? (
          <p className="mt-3 text-sm text-[#7d8b96]">No transactions yet. A deposit sets the opening balance.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#f0f3f5] text-sm">
            {transactions.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  {formatWhen(item.occurredAt)} · {movementLabels[item.kind] ?? item.kind}
                  {item.counterAccount ? ` · ${item.counterAccount.name}` : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
                <span className="font-semibold">{formatTaka(item.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {can(user, "accounts", "add") && account.isActive ? (
          <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={onSubmit}>
            <select className={fieldClass} aria-label="Transaction kind" value={kind} onChange={(event) => setKind(event.target.value as (typeof movementKinds)[number])}>
              {movementKinds.map((item) => (
                <option key={item} value={item}>
                  {movementLabels[item]}
                </option>
              ))}
            </select>
            <input className={fieldClass} inputMode="decimal" placeholder="Amount" aria-label="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            <input className={fieldClass} type="date" aria-label="Transaction date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} required />
            <Button type="submit" disabled={pending}>
              Record
            </Button>
            <input className={`${fieldClass} sm:col-span-3`} placeholder="Note" aria-label="Transaction note" value={note} onChange={(event) => setNote(event.target.value)} />
          </form>
        ) : null}
      </section>
    </div>
  );
}
