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
import { planInstallments } from "@/lib/installmentPlan";
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
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1e3a8a] via-[#1d4ed8] to-[#4f46e5] p-5 text-white shadow-[0_16px_40px_rgba(37,99,235,0.22)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Sales</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sales</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Bookings, sale price, money received, and what is still due.</p>
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

      <div className="flex gap-2">
        <TabButton active={panel === "sales"} onClick={() => setPanel("sales")} count={sales?.length ?? 0} tone="blue">
          Sales
        </TabButton>
        <TabButton active={panel === "bookings"} onClick={() => setPanel("bookings")} count={bookings?.length ?? 0} tone="amber">
          Bookings
        </TabButton>
      </div>

      {panel === "sales" ? (
        <section className="overflow-hidden rounded-[24px] border border-[#bfdbfe] bg-white shadow-[0_12px_32px_rgba(37,99,235,0.06)]">
          <div className="flex flex-col gap-3 border-b border-[#dbeafe] bg-[#eff6ff] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["open", "Open"],
                  ["due", "Due"],
                  ["clear", "Clear"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={saleFilter === id}
                  onClick={() => setSaleFilter(id)}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold", saleFilter === id ? "bg-[#1d4ed8] text-white" : "bg-white text-[#1d4ed8] ring-1 ring-[#bfdbfe]")}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="h-11 w-full rounded-xl border border-[#bfdbfe] bg-white px-3 text-sm outline-none focus:border-[#1d4ed8] sm:max-w-md"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sale, buyer, project, or unit"
              aria-label="Search sales"
            />
          </div>
          {sales === null ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">Loading sales…</p>
          ) : shownSales.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[#7d8b96]">{sales.length === 0 ? "A sale appears after an open booking is converted." : "No sales match this search."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.14em] text-[#1d4ed8]">
                  <tr>
                    {["Sale", "Buyer", "Place", "Net", "Received", "Due", "Status", "Actions"].map((label) => (
                      <th key={label} className="px-4 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownSales.map((sale) => {
                    const due = sale.status !== "cancelled" && moneyDue(sale.outstanding);
                    return (
                      <tr key={sale.id} className="border-t border-[#dbeafe]">
                        <td className="px-4 py-3">
                          <Link href={`/sales/${sale.id}`} className="font-semibold text-[#1d4ed8] hover:underline">
                            {sale.reference}
                          </Link>
                          <p className="mt-0.5 text-xs text-[#64748b]">
                            {formatTimestamp(sale.soldAt).slice(0, 11)}
                            {sale.booking ? ` · ${sale.booking.reference}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/buyers/${sale.buyer.id}`} className="font-medium text-[#1e3a8a] hover:underline">
                            {sale.buyer.name}
                          </Link>
                          {sale.buyer.phone ? <p className="mt-0.5 text-xs text-[#9d174d]">{sale.buyer.phone}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-[#1e3a8a]">
                          {sale.project.name} · {sale.unit.number}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#3730a3]">{formatTaka(sale.net)}</p>
                          <p className="mt-0.5 text-xs text-[#64748b]">
                            Price {formatTaka(sale.listPrice)} · Discount {formatTaka(sale.discount)}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#047857]">{formatTaka(sale.received)}</td>
                        <td className={cn("px-4 py-3 font-semibold", due ? "text-[#be123c]" : "text-[#0f766e]")}>{formatTaka(sale.outstanding)}</td>
                        <td className="px-4 py-3">
                          <StatusPill value={sale.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-nowrap justify-end gap-1.5">
                            <ActionLink href={`/sales/${sale.id}`}>View</ActionLink>
                            {canEdit ? <ActionButton onClick={() => void openSaleEdit(sale.id)}>Edit</ActionButton> : null}
                            {canDelete ? (
                              <ActionButton
                                danger
                                onClick={() => {
                                  setDeleteError("");
                                  setPendingDelete({ kind: "sale", id: sale.id, label: sale.reference });
                                }}
                              >
                                Delete
                              </ActionButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-[#fde68a] bg-white shadow-[0_12px_32px_rgba(217,119,6,0.06)]">
          <div className="flex flex-col gap-3 border-b border-[#fde68a] bg-[#fffbeb] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["open", "Open"],
                  ["converted", "Converted"],
                  ["cancelled", "Cancelled"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={bookingFilter === id}
                  onClick={() => setBookingFilter(id)}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold", bookingFilter === id ? "bg-[#d97706] text-white" : "bg-white text-[#b45309] ring-1 ring-[#fde68a]")}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="h-11 w-full rounded-xl border border-[#fde68a] bg-white px-3 text-sm outline-none focus:border-[#d97706] sm:max-w-md"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search booking, buyer, project, or unit"
              aria-label="Search sales"
            />
          </div>
          {bookings === null ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">Loading bookings…</p>
          ) : shownBookings.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[#7d8b96]">{bookings.length === 0 ? "No bookings yet." : "No bookings match this search."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.14em] text-[#b45309]">
                  <tr>
                    {["Booking", "Buyer", "Place", "Booked", "Refunded", "Status", "Actions"].map((label) => (
                      <th key={label} className="px-4 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownBookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-[#fde68a]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#9a3412]">{booking.reference}</p>
                        <p className="mt-0.5 text-xs text-[#64748b]">{formatTimestamp(booking.bookedAt).slice(0, 11)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/buyers/${booking.buyer.id}`} className="font-medium text-[#b45309] hover:underline">
                          {booking.buyer.name}
                        </Link>
                        {booking.buyer.phone ? <p className="mt-0.5 text-xs text-[#9d174d]">{booking.buyer.phone}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-[#9a3412]">
                        {booking.project.name} · {booking.unit.number}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#9a3412]">{formatTaka(booking.amount)}</p>
                        <BookingPlan booking={booking} />
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#be123c]">{formatTaka(booking.refunded)}</td>
                      <td className="px-4 py-3">
                        <StatusPill value={booking.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-nowrap justify-end gap-1.5">
                          {booking.receipt ? <ActionLink href={`/payments/${booking.receipt.id}/receipt`}>{booking.receipt.receiptNumber}</ActionLink> : null}
                          {booking.sale ? <ActionLink href={`/sales/${booking.sale.id}`}>{booking.sale.reference}</ActionLink> : null}
                          {booking.status === "open" && can(user, "sales", "add") ? <ActionButton onClick={() => setSaleBooking(booking)}>Create sale</ActionButton> : null}
                          {booking.status === "open" && can(user, "sales", "edit") ? (
                            <ActionButton danger onClick={() => setCancelBooking(booking)}>
                              Cancel
                            </ActionButton>
                          ) : null}
                          {canEdit ? <ActionButton onClick={() => setEditingBooking(booking)}>Edit</ActionButton> : null}
                          {canDelete ? (
                            <ActionButton
                              danger
                              onClick={() => {
                                setDeleteError("");
                                setPendingDelete({ kind: "booking", id: booking.id, label: booking.reference });
                              }}
                            >
                              Delete
                            </ActionButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

function ActionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex h-8 items-center rounded-lg bg-white px-2.5 text-xs font-semibold text-[#1d4ed8] ring-1 ring-[#bfdbfe] hover:bg-[#eff6ff]">
      {children}
    </Link>
  );
}

function ActionButton({ children, onClick, danger = false }: { children: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-lg bg-white px-2.5 text-xs font-semibold ring-1",
        danger ? "text-[#be123c] ring-[#fecdd3] hover:bg-[#fff1f2]" : "text-[#1d4ed8] ring-[#bfdbfe] hover:bg-[#eff6ff]",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", warn ? "bg-[#ffe4e6] text-[#9f1239]" : "bg-white/15 text-white")}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
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
  tone: "blue" | "amber";
  children: string;
}) {
  const on = tone === "blue" ? "bg-[#1d4ed8] text-white" : "bg-[#d97706] text-white";
  const chip = tone === "blue" ? "bg-[#eff6ff] text-[#1d4ed8]" : "bg-[#fffbeb] text-[#b45309]";
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold", active ? on : "bg-white text-[#334155] ring-1 ring-[#e2e8f0]")}>
      {children}
      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", active ? "bg-white/20" : chip)}>{count}</span>
    </button>
  );
}

function BookingPlan({ booking }: { booking: BookingListItem }) {
  if (booking.installmentYears < 1) return null;
  const plan = planInstallments(booking.unit.price, booking.amount, booking.installmentYears);
  if (!plan || plan.months === 0) return null;
  return (
    <p className="mt-0.5 text-xs font-medium text-[#166534]">
      {plan.years} {plan.years === 1 ? "year" : "years"} · {formatTaka(plan.regular)} / month
    </p>
  );
}

function moneyDue(value: string) {
  const cents = toCents(value);
  return cents !== null && cents > 0n;
}
