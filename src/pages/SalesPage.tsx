import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { BookingEditForm } from "@/components/sales/BookingEditForm";
import { BookingForm } from "@/components/sales/BookingForm";
import { CancelBookingDialog } from "@/components/sales/CancelBookingDialog";
import { SaleEditForm } from "@/components/sales/SaleEditForm";
import { SaleForm } from "@/components/sales/SaleForm";
import { StatusPill } from "@/components/sales/StatusPill";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { addMoney, formatTaka, toCents } from "@/lib/money";
import { formatTimestamp, type BookingListItem, type SaleDetail, type SaleListItem } from "@/lib/sales";
import { cn } from "@/lib/utils";

export function SalesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [bookings, setBookings] = useState<BookingListItem[] | null>(null);
  const [sales, setSales] = useState<SaleListItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [saleBooking, setSaleBooking] = useState<BookingListItem | null>(null);
  const [cancelBooking, setCancelBooking] = useState<BookingListItem | null>(null);
  const [editingBooking, setEditingBooking] = useState<BookingListItem | null>(null);
  const [editingSale, setEditingSale] = useState<SaleDetail | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "booking" | "sale"; id: string; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [panel, setPanel] = useState<"sales" | "bookings">("sales");
  const [query, setQuery] = useState("");
  const [saleFilter, setSaleFilter] = useState<"all" | "open" | "due" | "clear">("all");
  const [bookingFilter, setBookingFilter] = useState<"all" | "open" | "converted" | "cancelled">("all");
  const allowed = can(user, "sales", "view");

  function load() {
    Promise.all([api<{ bookings: BookingListItem[] }>("/api/bookings"), api<{ sales: SaleListItem[] }>("/api/sales")]).then(
      ([bookingResult, saleResult]) => {
        if (!bookingResult.ok) setError(bookingResult.error);
        else setBookings(bookingResult.data.bookings);
        if (!saleResult.ok) setError(saleResult.error);
        else setSales(saleResult.data.sales);
        if (bookingResult.ok && saleResult.ok) setError("");
      },
    );
  }

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    Promise.all([api<{ bookings: BookingListItem[] }>("/api/bookings"), api<{ sales: SaleListItem[] }>("/api/sales")]).then(
      ([bookingResult, saleResult]) => {
        if (!active) return;
        if (!bookingResult.ok) setError(bookingResult.error);
        else setBookings(bookingResult.data.bookings);
        if (!saleResult.ok) setError(saleResult.error);
        else setSales(saleResult.data.sales);
      },
    );
    return () => {
      active = false;
    };
  }, [allowed]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to sales.</p>;

  const canEdit = can(user, "sales", "edit");
  const canDelete = can(user, "sales", "delete");

  async function openSaleEdit(id: string) {
    const result = await api<SaleDetail>(`/api/sales/${id}`);
    if (!result.ok) setError(result.error);
    else setEditingSale(result.data);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const path = pendingDelete.kind === "sale" ? `/api/sales/${pendingDelete.id}` : `/api/bookings/${pendingDelete.id}`;
    const result = await api(path, { method: "DELETE", body: "{}" });
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setPendingDelete(null);
    setDeleteError("");
    setNotice(pendingDelete.kind === "sale" ? "Sale deleted." : "Booking deleted.");
    load();
  }

  const liveSales = (sales ?? []).filter((sale) => sale.status !== "cancelled");
  const openBookings = (bookings ?? []).filter((booking) => booking.status === "open").length;
  const dueSales = liveSales.filter((sale) => moneyDue(sale.outstanding)).length;
  const needle = query.trim().toLowerCase();
  const shownSales = (sales ?? []).filter((sale) => {
    const text = [sale.reference, sale.buyer.name, sale.project.name, sale.unit.number, sale.booking?.reference ?? ""].join(" ").toLowerCase();
    if (needle && !text.includes(needle)) return false;
    if (saleFilter === "open") return sale.status === "open";
    if (saleFilter === "due") return sale.status !== "cancelled" && moneyDue(sale.outstanding);
    if (saleFilter === "clear") return sale.status !== "cancelled" && !moneyDue(sale.outstanding);
    return true;
  });
  const shownBookings = (bookings ?? []).filter((booking) => {
    const text = [booking.reference, booking.buyer.name, booking.project.name, booking.unit.number].join(" ").toLowerCase();
    if (needle && !text.includes(needle)) return false;
    if (bookingFilter === "all") return true;
    return booking.status === bookingFilter;
  });

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#1d4ed8] via-[#4f46e5] to-[#7c3aed] p-5 text-white shadow-[0_16px_40px_rgba(37,99,235,0.22)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Sales</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sales</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              Bookings, sale price, discount, money received, and what is still due.
            </p>
          </div>
          {can(user, "sales", "add") ? (
            <Button className="bg-white text-[#1d4ed8] hover:bg-[#eff6ff]" onClick={() => setBookingOpen(true)}>
              <Plus className="h-4 w-4" />
              Book unit
            </Button>
          ) : null}
        </div>
        {sales && bookings ? (
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Open bookings" value={String(openBookings)} />
            <Stat label="Sales" value={String(liveSales.length)} />
            <Stat label="Received" value={formatTaka(addMoney(liveSales.map((sale) => sale.received)))} />
            <Stat label="Due" value={formatTaka(addMoney(liveSales.map((sale) => sale.outstanding)))} warn={dueSales > 0} />
          </dl>
        ) : null}
      </header>
      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <button type="button" aria-pressed={panel === "sales"} onClick={() => setPanel("sales")} className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold", panel === "sales" ? "bg-[#1d4ed8] text-white" : "bg-white text-[#334155] ring-1 ring-[#e2e8f0]")}>
            Sales
            <span className={cn("rounded-full px-2 py-0.5 text-[11px]", panel === "sales" ? "bg-white/20" : "bg-[#eff6ff] text-[#1d4ed8]")}>{sales?.length ?? 0}</span>
          </button>
          <button type="button" aria-pressed={panel === "bookings"} onClick={() => setPanel("bookings")} className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold", panel === "bookings" ? "bg-[#d97706] text-white" : "bg-white text-[#334155] ring-1 ring-[#e2e8f0]")}>
            Bookings
            <span className={cn("rounded-full px-2 py-0.5 text-[11px]", panel === "bookings" ? "bg-white/20" : "bg-[#fffbeb] text-[#b45309]")}>{bookings?.length ?? 0}</span>
          </button>
        </div>
        <input
          className="h-10 w-full rounded-xl border border-[#e6ebef] bg-white px-3 text-sm outline-none focus:border-[#1d4ed8] sm:max-w-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={panel === "sales" ? "Search sale, buyer, project, or unit" : "Search booking, buyer, project, or unit"}
          aria-label="Search sales"
        />
      </div>

      {panel === "sales" ? (
        <section className="overflow-hidden rounded-[24px] border border-[#dbeafe] bg-white shadow-[0_12px_32px_rgba(37,99,235,0.06)]">
          <div className="flex flex-col gap-3 bg-gradient-to-r from-[#1d4ed8] to-[#4f46e5] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Converted</p>
              <h2 className="text-lg font-semibold">Sales</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["open", "Open"],
                  ["due", "Due"],
                  ["clear", "Clear"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={saleFilter === id} onClick={() => setSaleFilter(id)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", saleFilter === id ? "bg-white text-[#1d4ed8]" : "bg-white/15 text-white")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {sales === null ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">Loading sales…</p>
          ) : shownSales.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">{sales.length === 0 ? "A sale appears after an open booking is converted." : "No sales match this search."}</p>
          ) : (
            <div className="grid gap-3 p-4 sm:p-5">
              {shownSales.map((sale) => (
                <SaleCard
                  key={sale.id}
                  sale={sale}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={() => void openSaleEdit(sale.id)}
                  onDelete={() => {
                    setDeleteError("");
                    setPendingDelete({ kind: "sale", id: sale.id, label: sale.reference });
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-[#fde68a] bg-white shadow-[0_12px_32px_rgba(217,119,6,0.06)]">
          <div className="flex flex-col gap-3 bg-gradient-to-r from-[#d97706] to-[#f59e0b] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Reservations</p>
              <h2 className="text-lg font-semibold">Bookings</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["open", "Open"],
                  ["converted", "Converted"],
                  ["cancelled", "Cancelled"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={bookingFilter === id} onClick={() => setBookingFilter(id)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", bookingFilter === id ? "bg-white text-[#b45309]" : "bg-white/15 text-white")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {bookings === null ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">Loading bookings…</p>
          ) : shownBookings.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">{bookings.length === 0 ? "No bookings yet." : "No bookings match this search."}</p>
          ) : (
            <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
              {shownBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  canCreate={booking.status === "open" && can(user, "sales", "add")}
                  canCancel={booking.status === "open" && can(user, "sales", "edit")}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onCreate={() => setSaleBooking(booking)}
                  onCancel={() => setCancelBooking(booking)}
                  onEdit={() => setEditingBooking(booking)}
                  onDelete={() => {
                    setDeleteError("");
                    setPendingDelete({ kind: "booking", id: booking.id, label: booking.reference });
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {bookingOpen ? (
        <BookingForm
          onClose={() => setBookingOpen(false)}
          onSaved={() => {
            setBookingOpen(false);
            setNotice("Unit booked.");
            load();
          }}
        />
      ) : null}
      {saleBooking ? (
        <SaleForm
          booking={saleBooking}
          onClose={() => setSaleBooking(null)}
          onSaved={(saleId) => {
            setSaleBooking(null);
            navigate(`/sales/${saleId}`);
          }}
        />
      ) : null}
      {cancelBooking ? (
        <CancelBookingDialog
          booking={cancelBooking}
          onClose={() => setCancelBooking(null)}
          onSaved={() => {
            setCancelBooking(null);
            setNotice("Booking cancelled.");
            load();
          }}
        />
      ) : null}
      {editingBooking ? (
        <BookingEditForm
          booking={editingBooking}
          onClose={() => setEditingBooking(null)}
          onSaved={() => {
            setEditingBooking(null);
            setNotice("Booking updated.");
            load();
          }}
        />
      ) : null}
      {editingSale ? (
        <SaleEditForm
          sale={editingSale.sale}
          installments={editingSale.installments}
          onClose={() => setEditingSale(null)}
          onSaved={() => {
            setEditingSale(null);
            setNotice("Sale updated.");
            load();
          }}
        />
      ) : null}
      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0c241f]/45 p-3 sm:items-center">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[22px] bg-white p-5">
            <h2 className="text-lg font-semibold">Delete {pendingDelete.label}?</h2>
            <p className="mt-2 text-sm text-[#5c6b76]">
              {pendingDelete.kind === "sale"
                ? "A sale with payments added after the booking stays on the record. Otherwise the booking opens again and the unit returns to reserved."
                : "An open booking and its receipt are removed, and the unit becomes available. A booking that already became a sale stays until that sale is deleted."}
            </p>
            {deleteError ? <p className="mt-3 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{deleteError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError("");
                }}
              >
                Keep
              </Button>
              <Button onClick={() => void confirmDelete()}>Delete</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const bookingBars: Record<BookingListItem["status"], string> = {
  open: "bg-gradient-to-r from-[#d97706] to-[#fbbf24]",
  converted: "bg-gradient-to-r from-[#0f766e] to-[#14b8a6]",
  cancelled: "bg-gradient-to-r from-[#e11d48] to-[#fb7185]",
};

function BookingCard({
  booking,
  canCreate,
  canCancel,
  canEdit,
  canDelete,
  onCreate,
  onCancel,
  onEdit,
  onDelete,
}: {
  booking: BookingListItem;
  canCreate: boolean;
  canCancel: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onCreate: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#fde68a] bg-[#fffbeb]">
      <div className={cn("h-1.5", bookingBars[booking.status])} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[#16302c]">{booking.reference}</p>
            <p className="mt-1 text-sm text-[#5c6b76]">
              <Link href={`/buyers/${booking.buyer.id}`} className="font-medium text-[#b45309] hover:underline">
                {booking.buyer.name}
              </Link>
              {" · "}
              {booking.project.name} · {booking.unit.number}
            </p>
            <p className="mt-1 text-xs text-[#94a3b8]">{formatTimestamp(booking.bookedAt)}</p>
          </div>
          <StatusPill value={booking.status} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <Mini label="Booked" value={formatTaka(booking.amount)} tone="bg-[#fff7ed] text-[#9a3412]" />
          <Mini label="Refunded" value={formatTaka(booking.refunded)} tone="bg-[#fff1f2] text-[#9f1239]" />
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {booking.receipt ? (
            <Link href={`/payments/${booking.receipt.id}/receipt`} className="inline-flex h-8 items-center rounded-xl bg-[#ecfdf5] px-3 text-xs font-semibold text-[#047857]">
              {booking.receipt.receiptNumber}
            </Link>
          ) : null}
          {booking.sale ? (
            <Link href={`/sales/${booking.sale.id}`} className="inline-flex h-8 items-center rounded-xl bg-[#eff6ff] px-3 text-xs font-semibold text-[#1d4ed8]">
              {booking.sale.reference}
            </Link>
          ) : null}
          {canCreate ? (
            <button type="button" className="h-8 rounded-xl bg-[#1d4ed8] px-3 text-xs font-semibold text-white" onClick={onCreate}>
              Create sale
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" className="h-8 rounded-xl bg-[#fff1f2] px-3 text-xs font-semibold text-[#be123c]" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className="h-8 rounded-xl bg-white px-3 text-xs font-semibold text-[#1d4ed8] ring-1 ring-[#bfdbfe]" onClick={onEdit}>
              Edit
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className="h-8 rounded-xl bg-white px-3 text-xs font-semibold text-[#be123c] ring-1 ring-[#fecdd3]" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SaleCard({
  sale,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  sale: SaleListItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const due = moneyDue(sale.outstanding);
  const bar =
    sale.status === "cancelled"
      ? "bg-gradient-to-r from-[#94a3b8] to-[#cbd5e1]"
      : due
        ? "bg-gradient-to-r from-[#e11d48] to-[#fb7185]"
        : "bg-gradient-to-r from-[#059669] to-[#34d399]";
  return (
    <article className="overflow-hidden rounded-2xl border border-[#dbeafe] bg-white">
      <div className={cn("h-1.5", bar)} />
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/sales/${sale.id}`} className="text-lg font-semibold text-[#16302c] hover:text-[#1d4ed8]">
              {sale.reference}
            </Link>
            <p className="mt-1 text-sm text-[#5c6b76]">
              <Link href={`/buyers/${sale.buyer.id}`} className="font-medium text-[#1d4ed8] hover:underline">
                {sale.buyer.name}
              </Link>
              {" · "}
              {sale.project.name} · {sale.unit.number}
            </p>
            <p className="mt-1 text-xs text-[#94a3b8]">
              {formatTimestamp(sale.soldAt)}
              {sale.booking ? ` · ${sale.booking.reference}` : ""}
            </p>
          </div>
          <StatusPill value={sale.status} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Mini label="Price" value={formatTaka(sale.listPrice)} tone="bg-[#eff6ff] text-[#1e3a8a]" />
          <Mini label="Discount" value={formatTaka(sale.discount)} tone="bg-[#fffbeb] text-[#92400e]" />
          <Mini label="Net" value={formatTaka(sale.net)} tone="bg-[#eef2ff] text-[#3730a3]" />
          <Mini label="Received" value={formatTaka(sale.received)} tone="bg-[#ecfdf5] text-[#065f46]" />
          <Mini label="Due" value={formatTaka(sale.outstanding)} tone={due ? "bg-[#fff1f2] text-[#9f1239]" : "bg-[#f0fdfa] text-[#115e59]"} />
        </dl>
        {canEdit || canDelete ? (
          <div className="mt-3 flex gap-2">
            {canEdit ? (
              <button type="button" className="h-8 rounded-xl bg-[#eff6ff] px-3 text-xs font-semibold text-[#1d4ed8]" onClick={onEdit}>
                Edit
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" className="h-8 rounded-xl bg-[#fff1f2] px-3 text-xs font-semibold text-[#be123c]" onClick={onDelete}>
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", warn ? "bg-[#ffe4e6] text-[#9f1239]" : "bg-white/15")}>
      <dt className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", warn ? "opacity-70" : "text-white/70")}>{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cn("rounded-xl px-3 py-2", tone)}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function moneyDue(value: string) {
  const cents = toCents(value);
  return cents !== null && cents > 0n;
}
