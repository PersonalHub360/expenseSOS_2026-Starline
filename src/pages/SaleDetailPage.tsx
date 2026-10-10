import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, CalendarClock, MapPin, UserRound } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { RecordFiles } from "@/components/files/RecordFiles";
import { PaymentForm } from "@/components/sales/PaymentForm";
import { SaleEditForm } from "@/components/sales/SaleEditForm";
import { StatusPill } from "@/components/sales/StatusPill";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka, toCents } from "@/lib/money";
import { formatProjectDate } from "@/lib/projects";
import { formatTimestamp, methodLabel, type SaleDetail } from "@/lib/sales";
import { cn } from "@/lib/utils";

export function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [panel, setPanel] = useState<"installments" | "payments" | "files">("installments");
  const id = params.id ?? "";

  function load() {
    api<SaleDetail>(`/api/sales/${id}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setDetail(result.data);
      }
    });
  }

  useEffect(() => {
    if (!id || !can(user, "sales", "view")) return;
    let active = true;
    api<SaleDetail>(`/api/sales/${id}`).then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else setDetail(result.data);
    });
    return () => {
      active = false;
    };
  }, [id, user]);

  if (!can(user, "sales", "view")) return <p className="text-sm text-[#b42318]">You do not have access to sales.</p>;

  const sale = detail?.sale;

  return (
    <div>
      <Link href="/sales" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#bfdbfe] bg-white px-4 text-sm font-semibold text-[#1d4ed8] hover:bg-[#eff6ff]">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      {notice ? <p className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {!sale || !detail ? (
        <p className="mt-4 text-sm text-[#7d8b96]">Loading sale…</p>
      ) : (
        <>
          <header className="mt-3 overflow-hidden rounded-[28px] bg-gradient-to-r from-[#1d4ed8] via-[#4f46e5] to-[#7c3aed] p-5 text-white shadow-[0_16px_40px_rgba(37,99,235,0.2)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight">{sale.reference}</h1>
                  <StatusPill value={sale.status} />
                </div>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/85">
                  <Link href={`/buyers/${sale.buyer.id}`} className="inline-flex items-center gap-1 hover:underline">
                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {sale.buyer.name}
                  </Link>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {sale.project.name} · {sale.unit.number}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatTimestamp(sale.soldAt)}
                  </span>
                </p>
                {sale.booking ? <p className="mt-1 text-sm text-white/75">Booking {sale.booking.reference}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {sale.status === "open" && can(user, "payments", "add") ? (
                  <Button className="bg-white text-[#1d4ed8] hover:bg-[#eff6ff]" onClick={() => setPaying(true)}>
                    Record payment
                  </Button>
                ) : null}
                {can(user, "sales", "edit") ? (
                  <Button className="bg-white text-[#1d4ed8] hover:bg-[#eff6ff]" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                ) : null}
                {can(user, "sales", "delete") ? (
                  <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setConfirming(true)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Figure label="Sale price" value={formatTaka(sale.listPrice)} />
              <Figure label="Discount" value={formatTaka(sale.discount)} />
              <Figure label="Net payable" value={formatTaka(sale.net)} />
              <Figure label="Received" value={formatTaka(sale.received)} />
              <Figure label="Outstanding" value={formatTaka(sale.outstanding)} warn={moneyDue(sale.outstanding)} />
            </dl>
          </header>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["installments", "Installments", String(detail.installments.length)],
                ["payments", "Payments", String(detail.payments.length)],
                ["files", "Files", ""],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={panel === id}
                onClick={() => setPanel(id)}
                className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold", panel === id ? "bg-[#1d4ed8] text-white" : "bg-white text-[#334155] ring-1 ring-[#e2e8f0]")}
              >
                {label}
                {count ? <span className={cn("rounded-full px-2 py-0.5 text-[11px]", panel === id ? "bg-white/20" : "bg-[#eff6ff] text-[#1d4ed8]")}>{count}</span> : null}
              </button>
            ))}
          </div>
          {panel === "installments" ? (
          <section className="mt-4 overflow-hidden rounded-[24px] border border-[#cffafe] bg-white">
            <div className="bg-gradient-to-r from-[#0891b2] to-[#2563eb] px-5 py-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Schedule</p>
              <h2 className="text-lg font-semibold">Installments</h2>
            </div>
            <ul className="grid gap-3 p-4 sm:p-5">
              {detail.installments.map((installment) => {
                const due = moneyDue(installment.outstanding);
                return (
                  <li key={installment.id} className={cn("rounded-2xl border px-4 py-3", due ? "border-[#fecdd3] bg-[#fff1f2]" : "border-[#a7f3d0] bg-[#ecfdf5]")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#16302c]">{installment.label}</p>
                        <p className="mt-1 text-xs text-[#64748b]">Due {formatProjectDate(installment.dueDate)}</p>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", due ? "bg-[#ffe4e6] text-[#be123c]" : "bg-[#d1fae5] text-[#047857]")}>
                        {due ? "Due" : "Paid"}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Amount</dt>
                        <dd className="font-semibold tabular-nums">{formatTaka(installment.amount)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Received</dt>
                        <dd className="font-semibold tabular-nums text-[#047857]">{formatTaka(installment.received)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Outstanding</dt>
                        <dd className={cn("font-semibold tabular-nums", due ? "text-[#be123c]" : "text-[#0f766e]")}>{formatTaka(installment.outstanding)}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </section>
          ) : null}
          {panel === "payments" ? (
          <section className="mt-4 overflow-hidden rounded-[24px] border border-[#a7f3d0] bg-white">
            <div className="bg-gradient-to-r from-[#059669] to-[#0f766e] px-5 py-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Receipts</p>
              <h2 className="text-lg font-semibold">Payments</h2>
            </div>
            {detail.payments.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[#7d8b96]">No payments recorded.</p>
            ) : (
              <ul className="grid gap-3 p-4 sm:p-5">
                {detail.payments.map((payment) => (
                  <li key={payment.id} className="rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/payments/${payment.id}/receipt`} className="font-semibold text-[#065f46] hover:underline">
                          {payment.receiptNumber}
                        </Link>
                      </div>
                      <span className="rounded-xl bg-[#d1fae5] px-2.5 py-1 font-semibold tabular-nums text-[#065f46]">{formatTaka(payment.amount)}</span>
                    </div>
                    <p className="mt-1 text-[#5c6b76]">
                      {methodLabel(payment.method)} · {formatTimestamp(payment.paidAt)}
                      {payment.note ? ` · ${payment.note}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          ) : null}
          {detail ? (
            <div className={panel === "files" ? "mt-4" : "hidden"}>
              <RecordFiles subjectType="sale" subjectId={id} module="sales" />
            </div>
          ) : null}
        </>
      )}
      {editing && detail ? (
        <SaleEditForm
          sale={detail.sale}
          installments={detail.installments}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice("Sale updated.");
            load();
          }}
        />
      ) : null}
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0c241f]/45 p-3 sm:items-center">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[22px] bg-white p-5">
            <h2 className="text-lg font-semibold">Delete this sale?</h2>
            <p className="mt-2 text-sm text-[#5c6b76]">A sale with payments added after the booking stays on the record.</p>
            {error ? <p className="mt-3 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button
                onClick={() => {
                  void api(`/api/sales/${id}`, { method: "DELETE", body: "{}" }).then((result) => {
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    navigate("/sales");
                  });
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {paying && detail ? (
        <PaymentForm
          saleId={id}
          installments={detail.installments}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            setNotice("Payment recorded.");
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function Figure({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", warn ? "bg-[#ffe4e6] text-[#9f1239]" : "bg-white/15 text-white")}>
      <dt className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", warn ? "text-[#be123c]" : "text-white/70")}>{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function moneyDue(value: string) {
  const cents = toCents(value);
  return cents !== null && cents > 0n;
}
