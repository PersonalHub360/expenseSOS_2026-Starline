import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Mail, MapPin, Phone, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { BuyerForm } from "@/components/sales/BuyerForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka, toCents } from "@/lib/money";
import { buyerDealStatusLabels, installmentScheduleLabels, type BuyerDealStatus, type BuyerListItem, type InstallmentSchedule } from "@/lib/sales";
import { cn } from "@/lib/utils";

export function BuyersPage() {
  const { user } = useAuth();
  const [buyers, setBuyers] = useState<BuyerListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const allowed = can(user, "buyers", "view");

  function load() {
    api<{ buyers: BuyerListItem[] }>("/api/buyers").then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setBuyers(result.data.buyers);
      }
    });
  }

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<{ buyers: BuyerListItem[] }>("/api/buyers").then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else setBuyers(result.data.buyers);
    });
    return () => {
      active = false;
    };
  }, [allowed]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to buyers.</p>;

  const needle = query.trim().toLowerCase();
  const shown = (buyers ?? []).filter((buyer) =>
    [buyer.name, buyer.phone, buyer.email, buyer.address].join(" ").toLowerCase().includes(needle),
  );

  const dueCount = (buyers ?? []).filter((buyer) => stillDue(buyer.outstanding)).length;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#be123c] via-[#db2777] to-[#7c3aed] p-5 text-white shadow-[0_16px_40px_rgba(190,18,60,0.2)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Sales</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Buyers</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              Contact details, projects, bookings, received money, and what is still due.
            </p>
          </div>
          {can(user, "buyers", "add") ? (
            <Button className="bg-white text-[#be123c] hover:bg-[#fff1f2]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New buyer
            </Button>
          ) : null}
        </div>
        {buyers ? (
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/15 px-3 py-1">{buyers.length} buyers</span>
            <span className="rounded-full bg-[#fecdd3] px-3 py-1 text-[#9f1239]">{dueCount} with dues</span>
            <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[#065f46]">{buyers.length - dueCount} clear</span>
          </div>
        ) : null}
      </header>
      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      <input
        className="h-11 w-full max-w-md rounded-xl border border-[#e6ebef] bg-white px-3 text-sm outline-none focus:border-[#be123c]"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name, phone, email, or address"
        aria-label="Search buyers"
      />
      {buyers === null ? (
        <p className="text-sm text-[#7d8b96]">Loading buyers…</p>
      ) : shown.length === 0 ? (
        <section className="rounded-[22px] border border-[#eef1f4] bg-white px-4 py-10 text-center">
          <p className="font-semibold">No buyers yet</p>
          <p className="mt-1 text-sm text-[#7d8b96]">Add a buyer before booking a unit.</p>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((buyer) => (
            <BuyerCard key={buyer.id} buyer={buyer} />
          ))}
        </div>
      )}
      {creating ? (
        <BuyerForm
          onClose={() => setCreating(false)}
          onSaved={(warning) => {
            setCreating(false);
            setNotice(warning ?? "Buyer saved.");
            load();
          }}
        />
      ) : null}
    </div>
  );
}

const avatarTones = [
  "bg-[#0f766e]",
  "bg-[#2563eb]",
  "bg-[#7c3aed]",
  "bg-[#db2777]",
  "bg-[#d97706]",
  "bg-[#0891b2]",
];

function BuyerCard({ buyer }: { buyer: BuyerListItem }) {
  const due = stillDue(buyer.outstanding);
  const initial = buyer.name.trim().charAt(0).toUpperCase() || "?";
  const avatar = avatarTones[(initial.charCodeAt(0) || 0) % avatarTones.length];
  return (
    <article className="overflow-hidden rounded-[24px] border border-[#e7eef2] bg-white shadow-[0_12px_32px_rgba(22,40,36,0.05)]">
      <div className={cn("h-1.5", due ? "bg-gradient-to-r from-[#e11d48] to-[#fb7185]" : "bg-gradient-to-r from-[#0f766e] to-[#14b8a6]")} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-semibold text-white", avatar)}>
              {initial}
            </span>
            <div className="min-w-0">
              <Link href={`/buyers/${buyer.id}`} className="text-lg font-semibold text-[#16302c] hover:text-[#be123c]">
                {buyer.name}
              </Link>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#5c6b76]">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-[#db2777]" aria-hidden="true" />
                  {buyer.phone || "No phone"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-[#2563eb]" aria-hidden="true" />
                  {buyer.email || "No email"}
                </span>
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-[#5c6b76]">
                <MapPin className="h-3.5 w-3.5 text-[#0f766e]" aria-hidden="true" />
                {buyer.address || "No address"}
              </p>
            </div>
          </div>
          <span className="flex flex-col items-end gap-1">
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", due ? "bg-[#ffe4e6] text-[#be123c]" : "bg-[#d1fae5] text-[#047857]")}>
              {due ? "Due" : buyer.sales > 0 ? "Clear" : "New"}
            </span>
            {buyer.dealStatus ? (
              <span className="rounded-full bg-[#f5f3ff] px-2.5 py-1 text-[11px] font-semibold text-[#6d28d9]">
                {buyerDealStatusLabels[buyer.dealStatus as BuyerDealStatus] ?? buyer.dealStatus}
              </span>
            ) : null}
          </span>
        </div>
        {buyer.projects.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {buyer.projects.map((project) => (
              <span key={project} className="rounded-full bg-[#f5f3ff] px-2.5 py-1 text-xs font-medium text-[#6d28d9]">
                {project}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[#94a3b8]">No project linked yet.</p>
        )}
        {buyer.flatAmount || buyer.size || buyer.installmentAmount || buyer.installmentSchedule || buyer.paymentAlertOn ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Plan label="Flat" value={buyer.flatAmount ? formatTaka(buyer.flatAmount) : "—"} />
            <Plan label="Size" value={buyer.size || "—"} />
            <Plan
              label="Installment"
              value={
                buyer.installmentAmount
                  ? `${formatTaka(buyer.installmentAmount)}${buyer.installmentSchedule ? ` · ${installmentScheduleLabels[buyer.installmentSchedule as InstallmentSchedule] ?? buyer.installmentSchedule}` : ""}`
                  : buyer.installmentSchedule
                    ? (installmentScheduleLabels[buyer.installmentSchedule as InstallmentSchedule] ?? buyer.installmentSchedule)
                    : "—"
              }
            />
            <Plan label="Alert" value={buyer.paymentAlertOn || "—"} />
          </dl>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Bookings" value={String(buyer.bookings)} detail={buyer.openBookings ? `${buyer.openBookings} open` : "None open"} tone="bg-[#fffbeb] text-[#92400e]" />
          <Tile label="Sales" value={String(buyer.sales)} detail={buyer.openSales ? `${buyer.openSales} open` : "None open"} tone="bg-[#eff6ff] text-[#1e3a8a]" />
          <Tile label="Received" value={formatTaka(buyer.received)} detail="On their sales" tone="bg-[#ecfdf5] text-[#065f46]" />
          <Tile label="Due" value={formatTaka(buyer.outstanding)} detail="Still outstanding" tone={due ? "bg-[#fff1f2] text-[#9f1239]" : "bg-[#f0fdfa] text-[#115e59]"} />
        </dl>
      </div>
    </article>
  );
}

function Plan({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#fff7ed] px-2.5 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c2410c]">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-semibold text-[#9a3412]">{value}</dd>
    </div>
  );
}

function Tile({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", tone)}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
      <p className="text-[11px] opacity-75">{detail}</p>
    </div>
  );
}

function stillDue(outstanding: string) {
  const cents = toCents(outstanding);
  return cents !== null && cents > 0n;
}
