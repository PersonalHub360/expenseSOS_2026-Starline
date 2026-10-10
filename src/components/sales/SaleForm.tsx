import { FormEvent, useMemo, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { addMoney, compareMoney, formatTaka, normalizeMoney, subtractMoney } from "@/lib/money";
import type { BookingListItem } from "@/lib/sales";

type InstallmentDraft = { label: string; dueDate: string; amount: string };

type SaleFormProps = {
  booking: BookingListItem;
  onClose: () => void;
  onSaved: (saleId: string) => void;
};

export function SaleForm({ booking, onClose, onSaved }: SaleFormProps) {
  const [listPrice, setListPrice] = useState(booking.unit.price);
  const [discount, setDiscount] = useState("0");
  const [rows, setRows] = useState<InstallmentDraft[]>(() => openingInstallments(booking.unit.price, booking.amount));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const net = useMemo(() => pricedNet(listPrice, discount), [listPrice, discount]);
  const scheduled = useMemo(() => sumDrafts(rows), [rows]);
  const gap = net && scheduled ? subtractMoney(net, scheduled) : null;

  function updateRow(index: number, patch: Partial<InstallmentDraft>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function matchSchedule() {
    if (!net) return;
    setRows((current) => {
      if (current.length === 0) return [{ label: "Installment 1", dueDate: isoDate(0), amount: net }];
      const earlier = current.slice(0, -1);
      const earlierTotal = sumDrafts(earlier);
      if (!earlierTotal || compareMoney(earlierTotal, net) > 0) return current;
      const last = subtractMoney(net, earlierTotal);
      if (compareMoney(last, "0.00") <= 0) return current;
      return [...earlier, { ...current[current.length - 1], amount: last }];
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!net) {
      setError("Enter a sale price greater than the discount.");
      return;
    }
    if (compareMoney(booking.amount, net) > 0) {
      setError("Booking money is more than the price after discount.");
      return;
    }
    if (!scheduled || compareMoney(scheduled, net) !== 0) {
      setError("Installments must add up to the sale price after discount.");
      return;
    }
    setPending(true);
    const result = await api<{ sale: { id: string } }>("/api/sales", {
      method: "POST",
      body: JSON.stringify({ bookingId: booking.id, listPrice, discount, installments: rows }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.sale.id);
  }

  return (
    <Dialog title={`Sale from ${booking.reference}`} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-3">
        <p className="text-sm text-[#5c6b76]">
          {booking.buyer.name} · {booking.project.name} · {booking.unit.number}. Booking money of {formatTaka(booking.amount)} is applied to the earliest installments.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Sale price (৳)
            <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={listPrice} onChange={(event) => setListPrice(event.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Discount (৳)
            <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </label>
        </div>
        <p className="text-sm">
          Price after discount: <span className="font-semibold">{net ? formatTaka(net) : "—"}</span>
          {gap ? (
            <span className={gap === "0.00" ? "text-[#0f6f62]" : "text-[#b42318]"}>
              {" "}
              · Left to schedule {formatTaka(gap)}
            </span>
          ) : null}
        </p>
        <div className="grid gap-2">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="grid gap-2 rounded-xl border border-[#eef1f4] p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
              <input
                aria-label={`Installment ${index + 1} label`}
                className={fieldClass}
                value={row.label}
                onChange={(event) => updateRow(index, { label: event.target.value })}
              />
              <input
                aria-label={`Installment ${index + 1} due date`}
                className={fieldClass}
                type="date"
                value={row.dueDate}
                onChange={(event) => updateRow(index, { dueDate: event.target.value })}
              />
              <input
                aria-label={`Installment ${index + 1} amount`}
                className={fieldClass}
                inputMode="decimal"
                value={row.amount}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setRows((current) => [
                ...current,
                { label: `Installment ${current.length + 1}`, dueDate: isoDate(30 * current.length), amount: "" },
              ])
            }
          >
            Add installment
          </Button>
          <Button type="button" variant="secondary" onClick={matchSchedule}>
            Match last installment
          </Button>
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create sale"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function pricedNet(listPrice: string, discount: string) {
  const price = normalizeMoney(listPrice);
  const off = normalizeMoney(discount || "0");
  if (!price || !off || compareMoney(price, "0.00") <= 0 || compareMoney(off, price) > 0) return null;
  const net = subtractMoney(price, off);
  return compareMoney(net, "0.00") > 0 ? net : null;
}

function sumDrafts(rows: InstallmentDraft[]) {
  if (rows.length === 0) return "0.00";
  const amounts = rows.map((row) => normalizeMoney(row.amount));
  if (amounts.some((amount) => !amount)) return null;
  return addMoney(amounts as string[]);
}

function openingInstallments(price: string, bookingAmount: string): InstallmentDraft[] {
  const net = normalizeMoney(price);
  const booking = normalizeMoney(bookingAmount);
  if (!net || !booking) return [{ label: "Installment 1", dueDate: isoDate(0), amount: "" }];
  if (compareMoney(booking, net) >= 0) return [{ label: "Installment 1", dueDate: isoDate(0), amount: net }];
  return [
    { label: "Installment 1", dueDate: isoDate(0), amount: booking },
    { label: "Installment 2", dueDate: isoDate(30), amount: subtractMoney(net, booking) },
  ];
}

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
