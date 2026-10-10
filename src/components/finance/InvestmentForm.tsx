import { type FormEvent, useEffect, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { type InvestmentRow } from "@/lib/finance";
import { compareMoney, formatTaka } from "@/lib/money";

export function InvestmentForm({
  rows,
  onClose,
  onChanged,
}: {
  rows: InvestmentRow[];
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const { user } = useAuth();
  const [records, setRecords] = useState(rows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRecords(rows);
  }, [rows]);

  function startEdit(row: InvestmentRow) {
    setEditingId(row.id);
    setAmount(row.received);
    setPendingId("");
    setConfirmId(null);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setAmount("");
    setError("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const editing = records.find((row) => row.id === editingId) ?? null;
    setPendingId(editing?.id ?? "new");
    const result = editing
      ? await api<{ investment: InvestmentRow }>(`/api/investments/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            investorName: editing.investorName,
            amount,
            expectedReturn: editing.expectedReturn,
            investedOn: editing.investedAt.slice(0, 10),
            projectId: editing.project?.id,
            purpose: editing.purpose,
            method: editing.method,
            note: editing.note,
            reference: editing.reference,
          }),
        })
      : await api<{ investment: InvestmentRow }>("/api/investments", {
          method: "POST",
          body: JSON.stringify({
            investorName: "",
            amount,
            expectedReturn: "0",
            investedOn: new Date().toISOString().slice(0, 10),
            method: "cash",
          }),
        });
    setPendingId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAmount("");
    setEditingId(null);
    onChanged(editing ? "Capital amount updated." : "Capital amount added.");
  }

  function askRemove(row: InvestmentRow) {
    setError("");
    if (compareMoney(row.returned, "0.00") > 0) {
      setConfirmId(null);
      setError("This capital has a return and cannot be deleted.");
      return;
    }
    setConfirmId(row.id);
  }

  async function remove(row: InvestmentRow) {
    setError("");
    if (compareMoney(row.returned, "0.00") > 0) {
      setConfirmId(null);
      setError("This capital has a return and cannot be deleted.");
      return;
    }
    setPendingId(row.id);
    const result = await api(`/api/investments/${row.id}`, { method: "DELETE" });
    setPendingId("");
    setConfirmId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (editingId === row.id) cancelEdit();
    onChanged("Capital amount deleted.");
  }

  return (
    <Dialog title="Capital" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">Add, edit, or delete a capital amount.</p>
        <label className="text-sm font-medium">
          Capital amount
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          {editingId ? (
            <Button type="button" variant="secondary" onClick={cancelEdit}>
              Cancel edit
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
          <Button type="submit" className="bg-[#7c3aed] hover:bg-[#6d28d9]" disabled={pendingId === "new" || pendingId === editingId}>
            {editingId ? "Save amount" : "Add capital"}
          </Button>
        </div>
      </form>
      <ul className="mt-4 divide-y divide-[#f4f0fa] rounded-2xl border border-[#e9e4f5]">
        {records.length === 0 ? <li className="px-3 py-4 text-sm text-[#64748b]">No capital recorded yet.</li> : null}
        {records.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
            <p className="font-semibold text-[#1e1b4b]">{formatTaka(row.received)}</p>
            <div className="flex gap-2">
              {confirmId === row.id ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setConfirmId(null)}>
                    Keep
                  </Button>
                  <Button type="button" onClick={() => remove(row)} disabled={pendingId === row.id}>
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  {can(user, "investments", "edit") ? (
                    <Button type="button" variant="secondary" onClick={() => startEdit(row)} disabled={pendingId === row.id}>
                      Edit
                    </Button>
                  ) : null}
                  {can(user, "investments", "delete") ? (
                    <Button type="button" variant="secondary" onClick={() => askRemove(row)} disabled={pendingId === row.id}>
                      Delete
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
