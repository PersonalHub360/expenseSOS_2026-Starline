import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { RecordFiles } from "@/components/files/RecordFiles";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/inventory/Dialog";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatWhen, investmentStatusLabels, payMethod, type InvestmentReturnRow, type InvestmentRow } from "@/lib/finance";
import { formatTaka } from "@/lib/money";
import { paymentMethodLabels, paymentMethods } from "@/lib/sales";

export function InvestmentDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const id = params.id ?? "";
  const [investment, setInvestment] = useState<InvestmentRow | null>(null);
  const [returns, setReturns] = useState<InvestmentReturnRow[]>([]);
  const [amount, setAmount] = useState("");
  const [returnedOn, setReturnedOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<(typeof paymentMethods)[number]>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  function load() {
    api<{ investment: InvestmentRow; returns: InvestmentReturnRow[] }>(`/api/investments/${id}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setInvestment(result.data.investment);
        setReturns(result.data.returns);
      }
    });
  }

  useEffect(() => {
    if (id && can(user, "investments", "view")) load();
  }, [id, user]);

  async function onReturn(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    const result = await api<{ investment: InvestmentRow; returns: InvestmentReturnRow[] }>(`/api/investments/${id}/returns`, {
      method: "POST",
      body: JSON.stringify({ amount, returnedOn, method, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setAmount("");
    setNote("");
    setNotice("Return recorded.");
    setInvestment(result.data.investment);
    setReturns(result.data.returns);
  }

  if (!can(user, "investments", "view")) {
    return (
      <div>
        <BackLink />
        <p className="mt-4 text-sm text-[#b42318]">You do not have access to investments.</p>
      </div>
    );
  }
  if (error && !investment) {
    return (
      <div>
        <BackLink />
        <p className="mt-4 text-sm text-[#b42318]">{error}</p>
      </div>
    );
  }
  if (!investment) {
    return (
      <div>
        <BackLink />
        <p className="mt-4 text-sm text-[#7d8b96]">Loading investment…</p>
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{investment.investorName}</h1>
          <p className="mt-1 text-sm text-[#5c6b76]">
            {formatWhen(investment.investedAt)} · {payMethod(investment.method)} · {investment.project?.name ?? "General"}
            {investment.purpose ? ` · ${investment.purpose}` : ""}
          </p>
        </div>
        <p className="rounded-full bg-[#e7f6f2] px-3 py-1 text-sm font-semibold text-[#0f6f62]">
          {investmentStatusLabels[investment.status] ?? investment.status}
        </p>
      </div>
      {notice ? <p className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      <dl className="mt-5 grid gap-3 sm:grid-cols-4">
        <Metric label="Received" value={formatTaka(investment.received)} />
        <Metric label="Expected return" value={formatTaka(investment.expectedReturn)} />
        <Metric label="Returned" value={formatTaka(investment.returned)} />
        <Metric label="Outstanding" value={formatTaka(investment.outstanding)} />
      </dl>
      {investment.note ? <p className="mt-4 text-sm text-[#5c6b76]">{investment.note}</p> : null}
      <RecordFiles subjectType="investment" subjectId={id} module="investments" />
      <section className="mt-6 rounded-[22px] border border-[#eef1f4] bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold">Returns</h2>
        {returns.length === 0 ? (
          <p className="mt-3 text-sm text-[#7d8b96]">Nothing has been returned yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#f0f3f5] text-sm">
            {returns.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span>
                  {formatWhen(item.returnedAt)} · {payMethod(item.method)}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
                <span className="font-semibold">{formatTaka(item.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {can(user, "investments", "add") && investment.status !== "returned" ? (
          <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={onReturn}>
            <input className={fieldClass} inputMode="decimal" placeholder="Amount" aria-label="Return amount" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            <input className={fieldClass} type="date" aria-label="Return date" value={returnedOn} onChange={(event) => setReturnedOn(event.target.value)} required />
            <select className={fieldClass} aria-label="Return method" value={method} onChange={(event) => setMethod(event.target.value as (typeof paymentMethods)[number])}>
              {paymentMethods.map((item) => (
                <option key={item} value={item}>
                  {paymentMethodLabels[item]}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={pending}>
              Record return
            </Button>
            <input className={`${fieldClass} sm:col-span-3`} placeholder="Note" aria-label="Return note" value={note} onChange={(event) => setNote(event.target.value)} />
          </form>
        ) : null}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/investments" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#e9e4f5] bg-white px-4 text-sm font-semibold text-[#1e1b4b] hover:bg-[#faf8ff]">
      <ArrowLeft className="h-4 w-4" />
      Back
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#eef1f4] bg-white px-4 py-3">
      <dt className="text-xs text-[#7d8b96]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
