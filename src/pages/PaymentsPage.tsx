import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Banknote, MapPin, Undo2, UserRound } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { CreateSlipForm } from "@/components/sales/CreateSlipForm";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { addMoney, formatTaka, subtractMoney } from "@/lib/money";
import { loadManualSlips, type ManualSlip } from "@/lib/manualSlip";
import { formatTimestamp, methodLabel } from "@/lib/sales";
import { cn } from "@/lib/utils";

type PaymentRow = {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  note: string;
  paidAt: string;
  buyerId: string | null;
  buyerName: string;
  buyerPhone: string;
  reference: string;
  projectName: string;
  unitNumber: string;
};

type RefundRow = {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  note: string;
  refundedAt: string;
  buyerId: string | null;
  buyerName: string;
  buyerPhone: string;
  bookingReference: string;
  projectName: string;
  unitNumber: string;
};

type RegisterLine = {
  id: string;
  href: string;
  receiptNumber: string;
  kind: "Payment" | "Refund";
  amount: string;
  method: string;
  note: string;
  buyerId: string | null;
  buyerName: string;
  buyerPhone: string;
  reference: string;
  projectName: string;
  unitNumber: string;
  at: string;
};

const methodTones: Record<string, string> = {
  cash: "bg-[#d1fae5] text-[#065f46]",
  bank: "bg-[#dbeafe] text-[#1e3a8a]",
  bkash: "bg-[#fce7f3] text-[#9d174d]",
  nagad: "bg-[#ffedd5] text-[#9a3412]",
  cheque: "bg-[#ede9fe] text-[#5b21b6]",
};

export function PaymentsPage() {
  const { user } = useAuth();
  const [lines, setLines] = useState<RegisterLine[] | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"all" | "Payment" | "Refund">("all");
  const [creating, setCreating] = useState(false);
  const [manualSlips, setManualSlips] = useState<ManualSlip[]>([]);
  const allowed = can(user, "payments", "view");
  const canCreate = can(user, "payments", "add");

  useEffect(() => {
    setManualSlips(loadManualSlips());
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<{ payments: PaymentRow[]; refunds: RefundRow[] }>("/api/payments").then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const payments = result.data.payments.map((payment) => ({
        id: payment.id,
        href: `/payments/${payment.id}/receipt`,
        receiptNumber: payment.receiptNumber,
        kind: "Payment" as const,
        amount: payment.amount,
        method: payment.method,
        note: payment.note,
        buyerId: payment.buyerId,
        buyerName: payment.buyerName,
        buyerPhone: payment.buyerPhone,
        reference: payment.reference,
        projectName: payment.projectName,
        unitNumber: payment.unitNumber,
        at: payment.paidAt,
      }));
      const refunds = result.data.refunds.map((refund) => ({
        id: refund.id,
        href: `/payments/refunds/${refund.id}/receipt`,
        receiptNumber: refund.receiptNumber,
        kind: "Refund" as const,
        amount: refund.amount,
        method: refund.method,
        note: refund.note,
        buyerId: refund.buyerId,
        buyerName: refund.buyerName,
        buyerPhone: refund.buyerPhone,
        reference: refund.bookingReference,
        projectName: refund.projectName,
        unitNumber: refund.unitNumber,
        at: refund.refundedAt,
      }));
      setLines([...payments, ...refunds].sort((left, right) => right.at.localeCompare(left.at)));
    });
    return () => {
      active = false;
    };
  }, [allowed]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to payments.</p>;

  const payments = (lines ?? []).filter((line) => line.kind === "Payment");
  const refunds = (lines ?? []).filter((line) => line.kind === "Refund");
  const collected = addMoney(payments.map((line) => line.amount));
  const refunded = addMoney(refunds.map((line) => line.amount));
  const net = subtractMoney(collected, refunded);
  const shown = (lines ?? []).filter((line) => kind === "all" || line.kind === kind);

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#047857] via-[#0f766e] to-[#2563eb] p-5 text-white shadow-[0_16px_40px_rgba(4,120,87,0.22)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Sales</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Payments</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Collections, refunds, receipt method, buyer, and the unit each payment belongs to.</p>
          </div>
          {canCreate ? (
            <button type="button" onClick={() => setCreating(true)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0f766e] hover:bg-[#ecfdf5]">
              Create Slip
            </button>
          ) : null}
        </div>
        {lines ? (
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/15 px-3 py-1">{lines.length} receipts</span>
            <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[#065f46]">{payments.length} payments</span>
            <span className="rounded-full bg-[#ffe4e6] px-3 py-1 text-[#9f1239]">{refunds.length} refunds</span>
            <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[#065f46]">Collected {formatTaka(collected)}</span>
            <span className="rounded-full bg-[#ffedd5] px-3 py-1 text-[#9a3412]">Refunded {formatTaka(refunded)}</span>
            <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[#1e3a8a]">Net {formatTaka(net)}</span>
          </div>
        ) : null}
      </header>
      {creating ? (
        <CreateSlipForm
          onClose={() => {
            setCreating(false);
            setManualSlips(loadManualSlips());
          }}
        />
      ) : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {manualSlips.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[#5b21b6]">Created slips</h2>
          <div className="grid gap-3">
            {manualSlips.map((slip) => (
              <Link key={slip.id} href={`/payments/slips/${slip.id}`} className="rounded-[22px] border border-[#ddd6fe] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(22,40,36,0.04)]">
                <span className="font-semibold text-[#5b21b6]">{slip.serial}</span>
                <span className="mt-1 block text-sm text-[#334155]">
                  {slip.buyerName} · {slip.buyerPhone}
                </span>
                <span className={`mt-1 block text-sm font-semibold ${slip.kind === "refund" ? "text-[#c2410c]" : "text-[#0f766e]"}`}>
                  {slip.kind === "refund" ? `Refund ${formatTaka(slip.amount)}` : formatTaka(slip.amount)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <FilterButton active={kind === "all"} onClick={() => setKind("all")} label="All" />
        <FilterButton active={kind === "Payment"} onClick={() => setKind("Payment")} label="Payments" />
        <FilterButton active={kind === "Refund"} onClick={() => setKind("Refund")} label="Refunds" />
      </div>
      {lines === null ? (
        <p className="text-sm text-[#7d8b96]">Loading payments…</p>
      ) : shown.length === 0 ? (
        <section className="rounded-[22px] border border-[#eef1f4] bg-white px-4 py-10 text-center">
          <p className="font-semibold">No receipts yet</p>
          <p className="mt-1 text-sm text-[#7d8b96]">A booking receipt is created when a unit is booked.</p>
        </section>
      ) : (
        <div className="grid gap-3">
          {shown.map((line) => (
            <ReceiptCard key={`${line.kind}-${line.id}`} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-semibold",
        active ? "bg-[#0f766e] text-white" : "bg-white text-[#0f766e] ring-1 ring-[#99f6e4]",
      )}
    >
      {label}
    </button>
  );
}

function ReceiptCard({ line }: { line: RegisterLine }) {
  const payment = line.kind === "Payment";
  const place = [line.projectName, line.unitNumber].filter(Boolean).join(" · ");
  return (
    <article className={cn("overflow-hidden rounded-[22px] border bg-white shadow-[0_10px_28px_rgba(22,40,36,0.04)]", payment ? "border-[#a7f3d0]" : "border-[#fecdd3]")}>
      <div className={cn("h-1.5", payment ? "bg-gradient-to-r from-[#059669] to-[#34d399]" : "bg-gradient-to-r from-[#e11d48] to-[#fb7185]")} />
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("grid h-9 w-9 place-items-center rounded-xl text-white", payment ? "bg-[#059669]" : "bg-[#e11d48]")}>
              {payment ? <Banknote className="h-4 w-4" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
            </span>
            <Link href={line.href} className="font-semibold text-[#16302c] hover:text-[#047857]">
              {line.receiptNumber}
            </Link>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", payment ? "bg-[#d1fae5] text-[#047857]" : "bg-[#ffe4e6] text-[#be123c]")}>
              {line.kind}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", methodTones[line.method] ?? "bg-[#f1f5f9] text-[#334155]")}>
              {methodLabel(line.method)}
            </span>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#5c6b76]">
            {line.buyerId ? (
              <Link href={`/buyers/${line.buyerId}`} className="inline-flex items-center gap-1 font-medium text-[#0f766e] hover:underline">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                {line.buyerName}
                {line.buyerPhone ? <span className="font-semibold text-[#9d174d]">{line.buyerPhone}</span> : null}
              </Link>
            ) : (
              <span>{line.buyerName || "No buyer"}</span>
            )}
            {place ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-[#2563eb]" aria-hidden="true" />
                {place}
              </span>
            ) : null}
            {line.reference ? <span>{line.reference}</span> : null}
          </p>
          <p className="mt-1 text-xs text-[#94a3b8]">{formatTimestamp(line.at)}</p>
          {line.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#475569]">{line.note}</p> : null}
        </div>
        <p className={cn("text-lg font-semibold tabular-nums", payment ? "text-[#047857]" : "text-[#be123c]")}>{formatTaka(line.amount)}</p>
      </div>
    </article>
  );
}
