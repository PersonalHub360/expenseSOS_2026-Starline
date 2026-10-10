import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { vendorKinds, type VendorProfile } from "@/lib/operations";

export function VendorForm({
  vendor,
  onClose,
  onSaved,
}: {
  vendor?: VendorProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [kind, setKind] = useState(vendor?.kind ?? "supplier");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [address, setAddress] = useState(vendor?.address ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await api(vendor ? `/api/vendors/${vendor.id}` : "/api/vendors", {
      method: vendor ? "PATCH" : "POST",
      body: JSON.stringify({ name, kind, phone, email, address, notes }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title={vendor ? "Edit vendor" : "New vendor"} onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <label className="text-sm font-medium">
          Name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Kind
          <select className={`${fieldClass} mt-1.5`} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            {vendorKinds.map((item) => (
              <option key={item} value={item}>
                {item === "supplier" ? "Supplier" : "Contractor"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Phone
          <input className={`${fieldClass} mt-1.5`} value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Email
          <input className={`${fieldClass} mt-1.5`} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Address
          <input className={`${fieldClass} mt-1.5`} value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Notes
          <textarea className={`${fieldClass} mt-1.5 min-h-20`} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save vendor"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
