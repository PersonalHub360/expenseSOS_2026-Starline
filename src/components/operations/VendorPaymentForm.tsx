import { type FormEvent, useEffect, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { accountKindLabels, type AccountRow } from "@/lib/finance";
import type { VendorBill } from "@/lib/operations";
import { paymentMethods, paymentMethodLabels } from "@/lib/sales";

export function VendorPaymentForm({
  bill,
  onClose,
  onSaved,
}: {
  bill: VendorBill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(bill.outstanding);
  const [method, setMethod] = useState<(typeof paymentMethods)[number]>("cash");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ accounts: AccountRow[] }>("/api/accounts").then((result) => {
      if (result.ok) setAccounts(result.data.accounts.filter((account) => account.isActive));
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await api(`/api/vendors/bills/${bill.id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount, method, accountId, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title={`Pay ${bill.reference}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">Open balance {formatTaka(bill.outstanding)}. The payment is taken from the selected account. Payments of ৳50,000.00 or more wait for approval.</p>
        <label className="text-sm font-medium">
          Paid from
          <select className={`${fieldClass} mt-1.5`} value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
            <option value="">Select cash or bank account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {accountKindLabels[account.kind] ?? account.kind} · {formatTaka(account.balance)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Amount (৳)
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Method
          <select className={`${fieldClass} mt-1.5`} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || accounts.length === 0}>
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
