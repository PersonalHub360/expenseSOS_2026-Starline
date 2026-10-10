import { type FormEvent, useEffect, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function BillForm({ vendorId, onClose, onSaved }: { vendorId: string; onClose: () => void; onSaved: () => void }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>("/api/expenses/catalog").then((result) => {
      if (result.ok) setProjects(result.data.projects);
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await api(`/api/vendors/${vendorId}/bills`, {
      method: "POST",
      body: JSON.stringify({ description, amount, billDate, dueDate, projectId: projectId || undefined }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Add bill" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">Bills of ৳50,000.00 or more need approval before they affect the outstanding balance.</p>
        <label className="text-sm font-medium">
          Description
          <input className={`${fieldClass} mt-1.5`} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Amount (৳)
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Bill date
            <input className={`${fieldClass} mt-1.5`} type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} required />
          </label>
          <label className="text-sm font-medium">
            Due date
            <input className={`${fieldClass} mt-1.5`} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
          </label>
        </div>
        <label className="text-sm font-medium">
          Project
          <select className={`${fieldClass} mt-1.5`} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save bill"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
