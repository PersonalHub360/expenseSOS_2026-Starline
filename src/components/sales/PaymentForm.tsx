import { FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { InstallmentBill } from "@/components/sales/InstallmentBill";
import { nextBillOnSchedule } from "@/lib/installmentPlan";
import { formatTaka } from "@/lib/money";
import { paymentMethodLabels, paymentMethods, type InstallmentRow, type PaymentMethod, type SalePayment } from "@/lib/sales";

type PaymentFormProps = {
  saleId: string;
  installments: InstallmentRow[];
  payments: SalePayment[];
  onClose: () => void;
  onSaved: () => void;
};

export function PaymentForm({ saleId, installments, payments, onClose, onSaved }: PaymentFormProps) {
  const openInstallments = installments.filter((installment) => installment.outstanding !== "0.00");
  const bill = nextBillOnSchedule(
    installments.map((installment) => installment.amount),
    [...payments].sort((left, right) => left.paidAt.localeCompare(right.paidAt)).map((payment) => payment.amount),
  );
  const [installmentId, setInstallmentId] = useState(openInstallments[0]?.id ?? "");
  const [amount, setAmount] = useState(bill && bill.next !== "0.00" ? bill.next : (openInstallments[0]?.outstanding ?? ""));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function chooseInstallment(id: string) {
    setInstallmentId(id);
    const installment = openInstallments.find((item) => item.id === id);
    if (installment) setAmount(installment.outstanding);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!installmentId) {
      setError("Choose an installment.");
      return;
    }
    setPending(true);
    const result = await api(`/api/sales/${saleId}/payments`, {
      method: "POST",
      body: JSON.stringify({ installmentId, amount, method, note, paidAt }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Record installment payment" onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="text-sm font-medium">
          Installment
          <select className={`${fieldClass} mt-1.5`} value={installmentId} onChange={(event) => chooseInstallment(event.target.value)}>
            {openInstallments.map((installment) => (
              <option key={installment.id} value={installment.id}>
                {installment.label} · due {installment.dueDate} · left {formatTaka(installment.outstanding)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Amount (৳)
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        {bill && bill.next !== "0.00" ? (
          <div className="grid gap-2">
            <InstallmentBill bill={bill} />
            <p className="text-xs text-[#64748b]">Anything above this installment fills the next ones. The sale total does not change.</p>
          </div>
        ) : null}
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
        <label className="text-sm font-medium">
          Payment date
          <input className={`${fieldClass} mt-1.5`} type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
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
          <Button type="submit" disabled={pending || openInstallments.length === 0}>
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
