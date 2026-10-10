import { FormEvent, useMemo, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { addMoney, compareMoney, formatTaka, normalizeMoney, subtractMoney } from "@/lib/money";
import type { InstallmentRow, SaleListItem } from "@/lib/sales";

type InstallmentDraft = { label: string; dueDate: string; amount: string };

export function SaleEditForm({
  sale,
  installments,
  onClose,
  onSaved,
}: {
  sale: SaleListItem;
  installments: InstallmentRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [listPrice, setListPrice] = useState(sale.listPrice);
  const [discount, setDiscount] = useState(sale.discount);
  const [rows, setRows] = useState<InstallmentDraft[]>(() =>
    installments.map((row) => ({ label: row.label, dueDate: row.dueDate, amount: row.amount })),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const net = useMemo(() => pricedNet(listPrice, discount), [listPrice, discount]);
  const scheduled = useMemo(() => sumDrafts(rows), [rows]);
  const gap = net && scheduled ? subtractMoney(net, scheduled) : null;

  function updateRow(index: number, patch: Partial<InstallmentDraft>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!net) {
      setError("Enter a sale price greater than the discount.");
      return;
    }
    if (!scheduled || compareMoney(scheduled, net) !== 0) {
      setError("Installments must add up to the sale price after discount.");
      return;
    }
    setPending(true);
    const result = await api(`/api/sales/${sale.id}`, {
      method: "PATCH",
      body: JSON.stringify({ listPrice, discount, installments: rows }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title={`Edit ${sale.reference}`} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-3">
        <p className="text-sm text-[#5c6b76]">
          {sale.buyer.name} · {sale.project.name} · {sale.unit.number}. If payments were added after the booking, only installment names and due dates can change.
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
          {gap ? <span className={gap === "0.00" ? "text-[#0f6f62]" : "text-[#b42318]"}> · Left to schedule {formatTaka(gap)}</span> : null}
        </p>
        <div className="grid gap-2">
          {rows.map((row, index) => (
            <div key={`${row.dueDate}-${index}`} className="grid gap-2 rounded-xl border border-[#eef1f4] p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
              <input aria-label={`Installment ${index + 1} label`} className={fieldClass} value={row.label} onChange={(event) => updateRow(index, { label: event.target.value })} />
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
              <Button type="button" variant="ghost" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows((current) => [...current, { label: `Installment ${current.length + 1}`, dueDate: "", amount: "" }])}
        >
          Add installment
        </Button>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save sale"}
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
