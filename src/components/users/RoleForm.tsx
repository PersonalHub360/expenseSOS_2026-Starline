import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function RoleForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await api<{ id: string }>("/api/users/roles", {
      method: "POST",
      body: JSON.stringify({ name, description, permissions: [] }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.id);
  }

  return (
    <Dialog title="Create role" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">Name the role here. Set what it can do in the Permissions section after it is saved.</p>
        <label className="text-sm font-medium">
          Role name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Description
          <input className={`${fieldClass} mt-1.5`} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create role"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
