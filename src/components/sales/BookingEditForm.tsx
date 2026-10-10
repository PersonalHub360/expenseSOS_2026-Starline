import { FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { BookingListItem } from "@/lib/sales";

export function BookingEditForm({
  booking,
  onClose,
  onSaved,
}: {
  booking: BookingListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(booking.amount);
  const [note, setNote] = useState(booking.note);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const amountLocked = booking.status !== "open";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await api(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      body: JSON.stringify({ amount, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title={`Edit ${booking.reference}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <p className="text-sm text-[#5c6b76]">
          {booking.buyer.name} · {booking.project.name} · {booking.unit.number}
        </p>
        <label className="text-sm font-medium">
          Booking amount (৳)
          <input
            className={`${fieldClass} mt-1.5`}
            inputMode="decimal"
            value={amount}
            disabled={amountLocked}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        {amountLocked ? <p className="text-xs text-[#7d8b96]">The amount stays fixed after the booking is converted or cancelled.</p> : null}
        <label className="text-sm font-medium">
          Note
          <textarea className={`${fieldClass} mt-1.5 min-h-24`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save booking"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
