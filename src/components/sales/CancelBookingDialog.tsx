import { FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { compareMoney, formatTaka, normalizeMoney } from "@/lib/money";
import { paymentMethodLabels, paymentMethods, type BookingListItem, type PaymentMethod } from "@/lib/sales";

type CancelBookingDialogProps = {
  booking: BookingListItem;
  onClose: () => void;
  onSaved: () => void;
};

export function CancelBookingDialog({ booking, onClose, onSaved }: CancelBookingDialogProps) {
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState(booking.refundable);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Enter the reason for cancellation.");
      return;
    }
    const refund = normalizeMoney(refundAmount);
    if (!refund || compareMoney(refund, "0.00") < 0) {
      setError("Enter a refund of zero or more, with up to 2 decimal places.");
      return;
    }
    if (compareMoney(refund, booking.refundable) > 0) {
      setError("The refund is greater than the booking money still held.");
      return;
    }
    setPending(true);
    const result = await api(`/api/bookings/${booking.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason, refundAmount, method, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title={`Cancel ${booking.reference}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <p className="text-sm text-[#5c6b76]">
          {booking.buyer.name} · {booking.project.name} · {booking.unit.number}. Booking money still held: {formatTaka(booking.refundable)}.
        </p>
        <label className="text-sm font-medium">
          Reason
          <input className={`${fieldClass} mt-1.5`} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Refund amount (৳)
          <input
            className={`${fieldClass} mt-1.5`}
            inputMode="decimal"
            value={refundAmount}
            onChange={(event) => setRefundAmount(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Refund method
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
          Receipt note
          <input className={`${fieldClass} mt-1.5`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Keep booking
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Cancelling…" : "Cancel booking"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
