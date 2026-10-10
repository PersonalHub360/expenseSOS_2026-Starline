import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { type InvestorOption } from "@/lib/finance";
import { formatTaka, formatShare, shareOfCapital } from "@/lib/money";

export function AddInvestorForm({
  capital,
  initial,
  onClose,
  onSaved,
}: {
  capital: string;
  initial?: { id: string | null; name: string; phone: string; note: string; shareBps: number } | null;
  onClose: () => void;
  onSaved: (investor: InvestorOption) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [share, setShare] = useState(initial && initial.shareBps > 0 ? formatShare(initial.shareBps).replace("%", "") : "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const amount = shareOfCapital(capital, share);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const shareValue = share.trim() === "" ? "0" : share.trim();
    if (!initial && !amount) {
      setPending(false);
      setError("Enter a share from 0.01% to 100%.");
      return;
    }
    if (share.trim() && !amount && !/^0(\.0{1,2})?$/.test(share.trim())) {
      setPending(false);
      setError("Enter a share from 0% to 100%.");
      return;
    }
    const result = initial?.id
      ? await api<{ investor: InvestorOption }>(`/api/investors/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, phone, note, share: shareValue }),
        })
      : await api<{ investor: InvestorOption }>("/api/investors", {
          method: "POST",
          body: JSON.stringify({ name, phone, note, share: shareValue, originalName: initial?.name ?? "" }),
        });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.investor);
  }

  return (
    <Dialog title={initial ? "Edit investor" : "Add investor"} onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">The amount follows the share of the capital. It is not typed in.</p>
        <label className="text-sm font-medium">
          Investor name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input className={`${fieldClass} mt-1.5`} value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
        </label>
        <label className="text-sm font-medium">
          Note
          <input className={`${fieldClass} mt-1.5`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Capital amount
          <input className={`${fieldClass} mt-1.5`} value={formatTaka(capital)} readOnly />
        </label>
        <label className="text-sm font-medium">
          Share percentage
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={share} onChange={(event) => setShare(event.target.value)} placeholder="25" required />
        </label>
        <label className="text-sm font-medium">
          Amount
          <input className={`${fieldClass} mt-1.5`} value={amount ? formatTaka(amount) : ""} readOnly placeholder="Calculated from the share" />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-[#7c3aed] hover:bg-[#6d28d9]" disabled={pending}>
            {initial ? "Save changes" : "Save investor"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
