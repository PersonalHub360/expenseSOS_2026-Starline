import { FormEvent, useEffect, useState } from "react";
import { Link } from "wouter";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { paymentMethodLabels, paymentMethods, type BuyerListItem, type CatalogUnit, type PaymentMethod } from "@/lib/sales";

type BookingFormProps = {
  onClose: () => void;
  onSaved: () => void;
};

export function BookingForm({ onClose, onSaved }: BookingFormProps) {
  const [buyers, setBuyers] = useState<BuyerListItem[]>([]);
  const [units, setUnits] = useState<CatalogUnit[]>([]);
  const [buyerId, setBuyerId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const available = units.filter((unit) => unit.status === "available");

  useEffect(() => {
    let active = true;
    Promise.all([api<{ buyers: BuyerListItem[] }>("/api/buyers"), api<{ units: CatalogUnit[] }>("/api/sales/catalog")]).then(
      ([buyerResult, unitResult]) => {
        if (!active) return;
        if (!buyerResult.ok) setError(buyerResult.error);
        else setBuyers(buyerResult.data.buyers);
        if (!unitResult.ok) setError(unitResult.error);
        else setUnits(unitResult.data.units);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!buyerId || !unitId) {
      setError("Choose a buyer and an available unit.");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || amount.trim() === "0") {
      setError("Enter a booking amount greater than zero.");
      return;
    }
    setPending(true);
    const result = await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({ buyerId, unitId, amount, method, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Book a unit" onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="text-sm font-medium">
          Buyer
          <select className={`${fieldClass} mt-1.5`} value={buyerId} onChange={(event) => setBuyerId(event.target.value)}>
            <option value="">Choose a buyer</option>
            {buyers.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.name}
                {buyer.phone ? ` · ${buyer.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
        {buyers.length === 0 ? (
          <p className="text-sm text-[#7d8b96]">
            Add a buyer first. <Link href="/buyers" className="font-medium text-[#12786c]">Open buyers</Link>
          </p>
        ) : null}
        <label className="text-sm font-medium">
          Unit
          <select className={`${fieldClass} mt-1.5`} value={unitId} onChange={(event) => setUnitId(event.target.value)}>
            <option value="">Choose an available unit</option>
            {available.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.projectName} · {unit.number} · {formatTaka(unit.price)}
              </option>
            ))}
          </select>
        </label>
        {units.length > 0 && available.length === 0 ? (
          <p className="text-sm text-[#7d8b96]">Every project unit is already reserved or sold.</p>
        ) : null}
        {units.length === 0 ? (
          <p className="text-sm text-[#7d8b96]">No project units are available to book yet.</p>
        ) : null}
        <label className="text-sm font-medium">
          Booking amount (৳)
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Method
          <select
            className={`${fieldClass} mt-1.5`}
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {paymentMethods.map((item) => (
              <option key={item} value={item}>
                {paymentMethodLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Note
          <input className={`${fieldClass} mt-1.5`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Booking…" : "Confirm booking"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
