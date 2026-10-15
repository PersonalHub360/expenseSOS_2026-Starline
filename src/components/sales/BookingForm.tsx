import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { installmentYearChoices, planInstallments } from "@/lib/installmentPlan";
import { formatTaka, normalizeMoney } from "@/lib/money";
import { paymentMethodLabels, paymentMethods, type BuyerListItem, type CatalogUnit, type PaymentMethod } from "@/lib/sales";
import { cn } from "@/lib/utils";

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
  const [years, setYears] = useState<(typeof installmentYearChoices)[number]>(3);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const available = units.filter((unit) => unit.status === "available");
  const unit = available.find((item) => item.id === unitId) ?? null;
  const plan = useMemo(() => (unit ? planInstallments(unit.price, amount, years) : null), [unit, amount, years]);

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
    const downpayment = normalizeMoney(amount);
    if (!buyerId || !unit) {
      setError("Choose a buyer and an available unit.");
      return;
    }
    if (!downpayment || downpayment === "0.00") {
      setError("Enter a downpayment greater than zero.");
      return;
    }
    if (!plan) {
      setError("Downpayment cannot be more than the flat price, and the balance must cover each month.");
      return;
    }
    setPending(true);
    const result = await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({ buyerId, unitId, amount: downpayment, method, note, installmentYears: years }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Book a unit" onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
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
          <label className="text-sm font-medium">
            Unit
            <select className={`${fieldClass} mt-1.5`} value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="">Choose an available unit</option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.projectName} · {item.number} · {formatTaka(item.price)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {buyers.length === 0 ? (
          <p className="text-sm text-[#7d8b96]">
            Add a buyer first. <Link href="/buyers" className="font-medium text-[#12786c]">Open buyers</Link>
          </p>
        ) : null}
        {units.length > 0 && available.length === 0 ? <p className="text-sm text-[#7d8b96]">Every project unit is already reserved or sold.</p> : null}

        <section className="grid gap-2 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-3 sm:grid-cols-4">
          <Fact label="Project" value={unit?.projectName ?? "Choose a unit"} />
          <Fact label="Flat size" value={unit ? formatUnitSize(unit.size, unit.sizeUnit) : "—"} />
          <Fact label="Flat price" value={unit ? formatTaka(unit.price) : "—"} />
          <Fact label="Unit" value={unit ? `${unit.number} · ${unit.type}` : "—"} />
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Downpayment (৳)
            <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </label>
          <label className="text-sm font-medium">
            Method
            <select className={`${fieldClass} mt-1.5`} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {paymentMethods.map((item) => (
                <option key={item} value={item}>
                  {paymentMethodLabels[item]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="text-sm font-medium">Installment type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {installmentYearChoices.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={years === choice}
                onClick={() => setYears(choice)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  years === choice ? "bg-[#1d4ed8] text-white" : "bg-white text-[#1d4ed8] ring-1 ring-[#bfdbfe]",
                )}
              >
                {choice} {choice === 1 ? "year" : "years"}
              </button>
            ))}
          </div>
        </div>

        <section className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#047857]">Auto installment</p>
          {plan && plan.months > 0 ? (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Fact label="Balance" value={formatTaka(plan.remaining)} />
              <Fact label="Months" value={String(plan.months)} />
              <Fact label="Each month" value={formatTaka(plan.regular)} />
              {plan.uneven ? <p className="text-xs text-[#166534] sm:col-span-3">The last month is {formatTaka(plan.last)} so the months add up to the balance.</p> : null}
            </div>
          ) : plan && plan.months === 0 ? (
            <p className="mt-2 text-sm text-[#166534]">The downpayment covers the flat price. There is no monthly installment.</p>
          ) : (
            <p className="mt-2 text-sm text-[#3f6212]">Choose a unit and a downpayment up to the flat price. The monthly amount is calculated from the balance and the years.</p>
          )}
        </section>

        <label className="text-sm font-medium">
          Note
          <input className={`${fieldClass} mt-1.5`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !plan}>
            {pending ? "Booking…" : "Confirm booking"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#1e3a8a]">{value}</p>
    </div>
  );
}

function formatUnitSize(size: string, unit: string) {
  const [whole, fraction = ""] = size.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${trimmed ? `${whole}.${trimmed}` : whole} ${unit}`;
}
