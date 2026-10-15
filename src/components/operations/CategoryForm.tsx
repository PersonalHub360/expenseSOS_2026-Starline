import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function CategoryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await api("/api/expenses/categories", { method: "POST", body: JSON.stringify({ name }) });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Add category" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">A category is a label for expenses. Saving one does not record money.</p>
        <label className="text-sm font-medium">
          Name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save category"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
