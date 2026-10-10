import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { type AccountRow } from "@/lib/finance";

export function AccountForm({ onClose, onSaved }: { onClose: () => void; onSaved: (account: AccountRow) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"cash" | "bank">("cash");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await api<{ account: AccountRow }>("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name, kind, accountNumber, note, isActive: true }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.account);
  }

  return (
    <Dialog title="Add account" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <label className="text-sm font-medium">
          Name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Kind
          <select className={`${fieldClass} mt-1.5`} value={kind} onChange={(event) => setKind(event.target.value as "cash" | "bank")}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Account number
          <input className={`${fieldClass} mt-1.5`} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} />
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
            Save account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function TransferForm({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const active = accounts.filter((account) => account.isActive);
  const [fromAccountId, setFromAccountId] = useState(active[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(active[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await api("/api/accounts/transfers", {
      method: "POST",
      body: JSON.stringify({ fromAccountId, toAccountId, amount, occurredOn, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Transfer" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <label className="text-sm font-medium">
          From
          <select className={`${fieldClass} mt-1.5`} value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} required>
            <option value="">Choose an account</option>
            {active.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          To
          <select className={`${fieldClass} mt-1.5`} value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} required>
            <option value="">Choose an account</option>
            {active.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Amount
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Date
          <input className={`${fieldClass} mt-1.5`} type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} required />
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
            Transfer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
