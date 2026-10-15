import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { RecordFiles } from "@/components/files/RecordFiles";
import { BuyerForm } from "@/components/sales/BuyerForm";
import { StatusPill } from "@/components/sales/StatusPill";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { AlertCircle, ArrowLeft, BadgeDollarSign, Banknote, Building2, CalendarCheck, CalendarClock, Mail, MapPin, Phone, StickyNote, Undo2 } from "lucide-react";
import { buyerInstallmentBill, planInstallments, yearsFromSchedule } from "@/lib/installmentPlan";
import { InstallmentBill } from "@/components/sales/InstallmentBill";
import { PaymentHistory } from "@/components/sales/PaymentHistory";
import { addMoney, formatTaka, toCents } from "@/lib/money";
import { buyerDealStatusLabels, formatTimestamp, installmentScheduleLabels, type BookingListItem, type BuyerDealStatus, type BuyerProfile, type InstallmentSchedule, type SaleListItem } from "@/lib/sales";
import { cn } from "@/lib/utils";

type BuyerPanel = "plan" | "deals" | "payments" | "files" | "history";

type HistoryEvent = {
  id: string;
  kind: "note" | "booking" | "sale" | "payment" | "installment" | "due" | "refund";
  at: string;
  title: string;
  detail: string;
  amount: string | null;
  href: string | null;
};

const historyLabels: Record<HistoryEvent["kind"], string> = {
  note: "Note",
  booking: "Booking",
  sale: "Sale",
  payment: "Payment",
  installment: "Installment",
  due: "Due",
  refund: "Refund",
};

const historyStyles: Record<
  HistoryEvent["kind"],
  { icon: typeof StickyNote; dot: string; card: string; amount: string }
> = {
  note: { icon: StickyNote, dot: "bg-[#7c3aed]", card: "border-[#ddd6fe] bg-[#f5f3ff]", amount: "bg-[#ede9fe] text-[#5b21b6]" },
  booking: { icon: CalendarCheck, dot: "bg-[#d97706]", card: "border-[#fde68a] bg-[#fffbeb]", amount: "bg-[#fef3c7] text-[#92400e]" },
  sale: { icon: BadgeDollarSign, dot: "bg-[#2563eb]", card: "border-[#bfdbfe] bg-[#eff6ff]", amount: "bg-[#dbeafe] text-[#1e3a8a]" },
  payment: { icon: Banknote, dot: "bg-[#059669]", card: "border-[#a7f3d0] bg-[#ecfdf5]", amount: "bg-[#d1fae5] text-[#065f46]" },
  installment: { icon: CalendarClock, dot: "bg-[#0891b2]", card: "border-[#a5f3fc] bg-[#ecfeff]", amount: "bg-[#cffafe] text-[#0e7490]" },
  due: { icon: AlertCircle, dot: "bg-[#e11d48]", card: "border-[#fecdd3] bg-[#fff1f2]", amount: "bg-[#ffe4e6] text-[#9f1239]" },
  refund: { icon: Undo2, dot: "bg-[#ea580c]", card: "border-[#fed7aa] bg-[#fff7ed]", amount: "bg-[#ffedd5] text-[#9a3412]" },
};

type BuyerDetail = {
  buyer: BuyerProfile;
  bookings: BookingListItem[];
  sales: SaleListItem[];
  payments: { id: string; receiptNumber: string; amount: string; method: string; paidAt: string; saleReference: string; bookingReference: string }[];
  refunds: { id: string; receiptNumber: string; amount: string; refundedAt: string }[];
  history: HistoryEvent[];
};

export function BuyerDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [detail, setDetail] = useState<BuyerDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [panel, setPanel] = useState<BuyerPanel>("payments");
  const id = params.id ?? "";

  function load() {
    api<BuyerDetail>(`/api/buyers/${id}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setDetail(result.data);
      }
    });
  }

  useEffect(() => {
    if (!id || !can(user, "buyers", "view")) return;
    let active = true;
    api<BuyerDetail>(`/api/buyers/${id}`).then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else setDetail(result.data);
    });
    return () => {
      active = false;
    };
  }, [id, user]);

  if (!can(user, "buyers", "view")) return <p className="text-sm text-[#b42318]">You do not have access to buyers.</p>;

  async function removeBuyer() {
    const result = await api(`/api/buyers/${id}`, { method: "DELETE", body: JSON.stringify({}) });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/buyers");
  }

  const buyer = detail?.buyer;
  const historyEvents = detail?.history.filter((event) => event.kind !== "booking") ?? [];
  const liveSales = detail?.sales.filter((sale) => sale.status !== "cancelled") ?? [];
  const received = addMoney(liveSales.map((sale) => sale.received));
  const due = addMoney(liveSales.map((sale) => sale.outstanding));
  const dueOpen = (toCents(due) ?? 0n) > 0n;
  const initial = buyer?.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div>
      <Link href="/buyers" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#fecdd3] bg-white px-4 text-sm font-semibold text-[#9f1239] hover:bg-[#fff1f2]">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      {notice ? <p className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {!buyer || !detail ? (
        <p className="mt-4 text-sm text-[#7d8b96]">Loading buyer…</p>
      ) : (
        <>
          <header className="mt-3 overflow-hidden rounded-[28px] bg-gradient-to-r from-[#be123c] via-[#db2777] to-[#7c3aed] p-5 text-white shadow-[0_16px_40px_rgba(190,18,60,0.18)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl font-semibold">{initial}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-semibold tracking-tight">{buyer.name}</h1>
                    {buyer.dealStatus ? (
                      <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                        {buyerDealStatusLabels[buyer.dealStatus as BuyerDealStatus] ?? buyer.dealStatus}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 flex flex-wrap gap-2 text-sm text-white/90">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {buyer.phone || "No phone"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      {buyer.email || "No email"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {buyer.address || "No address"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {can(user, "buyers", "edit") ? (
                  <Button className="bg-white text-[#be123c] hover:bg-[#fff1f2]" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                ) : null}
                {can(user, "buyers", "delete") ? (
                  <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setConfirming(true)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Summary label="Bookings" value={String(detail.bookings.length)} />
              <Summary label="Sales" value={String(liveSales.length)} />
              <Summary label="Received" value={formatTaka(received)} />
              <Summary label="Due" value={formatTaka(due)} tone={dueOpen ? "bg-[#ffe4e6] text-[#9f1239]" : undefined} />
            </dl>
          </header>
          <div className="sticky top-0 z-20 mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-[#efe7f5] bg-white/95 p-2 shadow-sm backdrop-blur">
            {(
              [
                ["payments", "Payments", String(detail.payments.length + detail.refunds.length)],
                ["files", "Files", ""],
                ["plan", "Plan", ""],
                ["deals", "Bookings", String(detail.bookings.length)],
                ["history", "History", String(historyEvents.length)],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={panel === id}
                onClick={() => setPanel(id)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold",
                  panel === id ? panelOn[id] : "text-[#52616b] hover:bg-[#f8fafc]",
                )}
              >
                {label}
                {count ? <span className={cn("rounded-full px-2 py-0.5 text-[11px]", panel === id ? "bg-white/25" : "bg-[#f1f5f9]")}>{count}</span> : null}
              </button>
            ))}
          </div>
          {panel === "plan" ? <BuyerPlanPanel buyer={buyer} payments={detail.payments} /> : null}
          {panel === "deals" ? (
          <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-[24px] border border-[#fde68a] bg-white shadow-[0_12px_32px_rgba(217,119,6,0.06)]">
              <div className="flex items-center justify-between bg-gradient-to-r from-[#d97706] to-[#f59e0b] px-5 py-4 text-white">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Reservations</p>
                  <h2 className="text-lg font-semibold">Bookings</h2>
                </div>
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{detail.bookings.length}</span>
              </div>
              {detail.bookings.length === 0 ? (
                <p className="px-5 py-8 text-sm text-[#7d8b96]">No bookings yet.</p>
              ) : (
                <ul className="space-y-3 p-4 sm:p-5">
                  {detail.bookings.map((booking) => (
                    <BookingCard key={booking.id} booking={booking} />
                  ))}
                </ul>
              )}
            </section>
            <section className="overflow-hidden rounded-[24px] border border-[#bfdbfe] bg-white shadow-[0_12px_32px_rgba(37,99,235,0.06)]">
              <div className="flex items-center justify-between bg-gradient-to-r from-[#2563eb] to-[#38bdf8] px-5 py-4 text-white">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Agreements</p>
                  <h2 className="text-lg font-semibold">Sales</h2>
                </div>
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{detail.sales.length}</span>
              </div>
              {detail.sales.length === 0 ? (
                <p className="px-5 py-8 text-sm text-[#7d8b96]">No sales yet.</p>
              ) : (
                <ul className="space-y-3 p-4 sm:p-5">
                  {detail.sales.map((sale) => (
                    <li key={sale.id} className="rounded-2xl border border-[#dbeafe] bg-[#f8fbff] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link href={`/sales/${sale.id}`} className="font-semibold text-[#1d4ed8] hover:underline">
                            {sale.reference}
                          </Link>
                          <p className="mt-1 text-sm text-[#5c6b76]">{sale.unit.number}</p>
                        </div>
                        <StatusPill value={sale.status} />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2">
                        <Fact label="Net" value={formatTaka(sale.net)} tone="bg-[#eff6ff] text-[#1e3a8a]" />
                        <Fact label="Outstanding" value={formatTaka(sale.outstanding)} tone={(toCents(sale.outstanding) ?? 0n) > 0n ? "bg-[#fff1f2] text-[#9f1239]" : "bg-[#ecfdf5] text-[#065f46]"} />
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          ) : null}
          {panel === "payments" ? <PaymentHistory buyer={buyer} payments={detail.payments} refunds={detail.refunds} /> : null}
          {panel === "history" ? (
          <section className="mt-4 overflow-hidden rounded-[24px] border border-[#efe7f5] bg-white shadow-[0_12px_32px_rgba(124,58,237,0.06)]">
            <div className="flex items-center justify-between bg-gradient-to-r from-[#7c3aed] via-[#db2777] to-[#f97316] px-5 py-4 text-white">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Timeline</p>
                <h2 className="text-lg font-semibold">History</h2>
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{historyEvents.length} events</span>
            </div>
            {historyEvents.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[#7d8b96]">No sales, payments, or notes yet.</p>
            ) : (
              <ol className="max-h-[70vh] space-y-3 overflow-y-auto p-4 sm:p-5">
                {historyEvents.map((event, index) => (
                  <HistoryItem key={event.id} event={event} last={index === historyEvents.length - 1} />
                ))}
              </ol>
            )}
          </section>
          ) : null}
          {buyer ? (
            <div className={panel === "files" ? "mt-4" : "hidden"}>
              <RecordFiles subjectType="buyer" subjectId={id} module="buyers" />
            </div>
          ) : null}
        </>
      )}
      {editing && buyer ? (
        <BuyerForm
          buyer={buyer}
          onClose={() => setEditing(false)}
          onSaved={(warning) => {
            setEditing(false);
            setNotice(warning ?? "Buyer updated.");
            load();
          }}
        />
      ) : null}
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0c241f]/45 p-3 sm:items-center">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[22px] bg-white p-5">
            <h2 className="text-lg font-semibold">Remove this buyer?</h2>
            <p className="mt-2 text-sm text-[#5c6b76]">
              {detail && (detail.bookings.length > 0 || detail.sales.length > 0)
                ? "Their bookings, sales, and receipts are removed too. Received money on those records comes off the books, and a unit they held is free again when nobody else holds it."
                : "This buyer has no booking or sale. Only this contact record is removed."}
            </p>
            {error ? <p className="mt-3 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button onClick={() => void removeBuyer()}>Remove</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const panelOn: Record<BuyerPanel, string> = {
  payments: "bg-[#059669] text-white",
  files: "bg-[#7c3aed] text-white",
  plan: "bg-[#be123c] text-white",
  deals: "bg-[#d97706] text-white",
  history: "bg-[#db2777] text-white",
};

const bookingBars: Record<BookingListItem["status"], string> = {
  open: "bg-gradient-to-r from-[#d97706] to-[#fbbf24]",
  converted: "bg-gradient-to-r from-[#0f766e] to-[#14b8a6]",
  cancelled: "bg-gradient-to-r from-[#e11d48] to-[#fb7185]",
};

function BookingCard({ booking }: { booking: BookingListItem }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-[#fde68a] bg-[#fffbeb]">
      <div className={cn("h-1.5", bookingBars[booking.status])} />
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-[#16302c]">{booking.reference}</p>
            <p className="mt-1 text-sm text-[#5c6b76]">
              {booking.project.name} · {booking.unit.number}
            </p>
            <p className="mt-1 text-xs text-[#94a3b8]">{formatTimestamp(booking.bookedAt)}</p>
          </div>
          <div className="text-right">
            <StatusPill value={booking.status} />
            <p className="mt-2 text-sm font-semibold tabular-nums text-[#92400e]">{formatTaka(booking.amount)}</p>
          </div>
        </div>
        {booking.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#5c6b76]">{booking.note}</p> : null}
        {booking.cancellationReason ? <p className="mt-2 text-sm text-[#9f1239]">{booking.cancellationReason}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {booking.sale ? (
            <Link href={`/sales/${booking.sale.id}`} className="font-medium text-[#1d4ed8] hover:underline">
              {booking.sale.reference}
            </Link>
          ) : null}
          {booking.receipt ? (
            <Link href={`/payments/${booking.receipt.id}/receipt`} className="font-medium text-[#047857] hover:underline">
              {booking.receipt.receiptNumber}
            </Link>
          ) : null}
          {booking.refunded !== "0.00" ? <span className="text-[#9a3412]">Refunded {formatTaka(booking.refunded)}</span> : null}
        </div>
      </div>
    </li>
  );
}

function HistoryItem({ event, last }: { event: HistoryEvent; last: boolean }) {
  const style = historyStyles[event.kind];
  const Icon = style.icon;
  const title = event.href ? (
    <Link href={event.href} className="font-semibold text-[#16302c] hover:text-[#be123c]">
      {event.title}
    </Link>
  ) : (
    <span className="font-semibold text-[#16302c]">{event.title}</span>
  );
  return (
    <li className="flex gap-3">
      <div className="flex w-10 shrink-0 flex-col items-center">
        <span className={cn("grid h-10 w-10 place-items-center rounded-2xl text-white shadow-sm", style.dot)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        {last ? null : <span className="mt-1 w-px flex-1 bg-gradient-to-b from-[#e9d5ff] to-[#fce7f3]" />}
      </div>
      <article className={cn("mb-1 min-w-0 flex-1 rounded-2xl border px-4 py-3", style.card)}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{historyLabels[event.kind]}</p>
            <p className="mt-0.5 text-xs text-[#64748b]">{formatTimestamp(event.at)}</p>
          </div>
          {event.amount ? (
            <span className={cn("rounded-xl px-2.5 py-1 text-sm font-semibold tabular-nums", style.amount)}>{formatTaka(event.amount)}</span>
          ) : null}
        </div>
        <p className="mt-2 text-sm">{title}</p>
        {event.detail ? <p className="mt-1 whitespace-pre-wrap text-sm text-[#5c6b76]">{event.detail}</p> : null}
      </article>
    </li>
  );
}

function BuyerPlanPanel({ buyer, payments }: { buyer: BuyerProfile; payments: { amount: string; paidAt: string; bookingReference: string }[] }) {
  const years = yearsFromSchedule(buyer.installmentSchedule);
  const plan = years ? planInstallments(buyer.flatAmount, buyer.installmentPayment, years) : null;
  const bill = buyerInstallmentBill({
    ...buyer,
    installmentPayments: payments
      .filter((payment) => !payment.bookingReference)
      .sort((left, right) => left.paidAt.localeCompare(right.paidAt))
      .map((payment) => payment.amount),
  });
  const legacy = installmentScheduleLabels[buyer.installmentSchedule as InstallmentSchedule];
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <section className="rounded-[22px] border border-[#dbeafe] bg-white p-4 lg:col-span-2">
        <PanelTitle icon={Building2} title="Flat plan" tone="bg-[#dbeafe] text-[#1d4ed8]" />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label="Project" value={buyer.projectName || "Not set"} tone="bg-[#eff6ff] text-[#1e3a8a]" />
          <Fact label="Flat size" value={buyer.size || "Not set"} tone="bg-[#eff6ff] text-[#1e3a8a]" />
          <Fact label="Flat price" value={buyer.flatAmount ? formatTaka(buyer.flatAmount) : "Not set"} tone="bg-[#eef2ff] text-[#3730a3]" />
          <Fact label="Downpayment" value={buyer.installmentPayment ? formatTaka(buyer.installmentPayment) : "Not set"} tone="bg-[#ecfdf5] text-[#065f46]" />
          <Fact label="Installment type" value={years ? `${years} ${years === 1 ? "year" : "years"}` : legacy || "Not set"} tone="bg-[#f0fdf4] text-[#166534]" />
          <Fact label="Monthly installment" value={plan && plan.months > 0 ? formatTaka(plan.regular) : buyer.installmentAmount ? formatTaka(buyer.installmentAmount) : "Not set"} tone="bg-[#f0fdf4] text-[#166534]" />
          <Fact label="Status" value={buyer.dealStatus ? (buyerDealStatusLabels[buyer.dealStatus as BuyerDealStatus] ?? buyer.dealStatus) : "Not set"} tone="bg-[#f5f3ff] text-[#6d28d9]" />
          <Fact label="Payment alert" value={buyer.paymentAlertOn || "Not set"} tone="bg-[#fff7ed] text-[#c2410c]" />
          <Fact label="Balance" value={plan ? formatTaka(plan.remaining) : "Not set"} tone="bg-[#fffbeb] text-[#92400e]" />
        </div>
        {bill ? <div className="mt-3"><InstallmentBill bill={bill} /></div> : null}
        {plan?.uneven ? <p className="mt-3 text-sm text-[#166534]">The last month is {formatTaka(plan.last)} so the months add up to the balance. This plan is not added to received money.</p> : <p className="mt-3 text-sm text-[#64748b]">This plan stays on the buyer. It is not added to received money or profit.</p>}
      </section>
      <section className="rounded-[22px] border border-[#f3e8ff] bg-[#faf5ff] p-4">
        <PanelTitle icon={StickyNote} title="Notes" tone="bg-[#ede9fe] text-[#7c3aed]" />
        <p className="mt-3 whitespace-pre-wrap text-sm text-[#4c1d95]">{buyer.notes || "No notes yet."}</p>
      </section>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, tone }: { icon: typeof Building2; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("grid h-8 w-8 place-items-center rounded-xl", tone)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <h2 className="text-sm font-semibold text-[#16302c]">{title}</h2>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <p className={cn("rounded-2xl px-3 py-3", tone)}>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</span>
      <span className="mt-1 block text-sm font-semibold">{value}</span>
    </p>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", tone ?? "bg-white/15")}>
      <dt className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", tone ? "opacity-70" : "text-white/70")}>{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
