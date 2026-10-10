import { type FormEvent, useEffect, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { expenseCategories, frequencies, frequencyLabels, type ExpenseDetail } from "@/lib/operations";
import { formatTaka } from "@/lib/money";
import { accountKindLabels } from "@/lib/finance";
import { paymentMethods, paymentMethodLabels } from "@/lib/sales";

type Catalog = {
  projects: { id: string; name: string }[];
  accounts: { id: string; name: string; kind: string; balance: string }[];
};

export function ExpenseForm({ onClose, onSaved }: { onClose: () => void; onSaved: (expense: ExpenseDetail) => void }) {
  const [catalog, setCatalog] = useState<Catalog>({ projects: [], accounts: [] });
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<string>(expenseCategories[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof paymentMethods)[number]>("cash");
  const [accountId, setAccountId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<(typeof frequencies)[number]>("monthly");
  const [nextDueDate, setNextDueDate] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<Catalog>("/api/expenses/catalog").then((result) => {
      if (result.ok) setCatalog(result.data);
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    if (!accountId) {
      setPending(false);
      setError("Choose the cash or bank account this expense is paid from.");
      return;
    }
    const result = await api<{ expense: ExpenseDetail }>("/api/expenses", {
      method: "POST",
      body: JSON.stringify({
        spentOn,
        category,
        description,
        amount,
        method,
        accountId,
        projectId: projectId || undefined,
        frequency: recurring ? frequency : null,
        nextDueDate: recurring ? nextDueDate : "",
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.expense);
  }

  return (
    <Dialog title="Record expense" onClose={onClose} wide>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">
          The amount is taken from the selected cash or bank account. Amounts of ৳50,000.00 or more are taken after someone else approves them.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Date
            <input className={`${fieldClass} mt-1.5`} type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} required />
          </label>
          <label className="text-sm font-medium">
            Category
            <input className={`${fieldClass} mt-1.5`} list="expense-categories" value={category} onChange={(event) => setCategory(event.target.value)} required />
            <datalist id="expense-categories">
              {expenseCategories.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Description
            <input className={`${fieldClass} mt-1.5`} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Amount (৳)
            <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <label className="text-sm font-medium">
            Payment method
            <select className={`${fieldClass} mt-1.5`} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
              {paymentMethods.map((item) => (
                <option key={item} value={item}>
                  {paymentMethodLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Paid from
            <select className={`${fieldClass} mt-1.5`} value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
              <option value="">Select cash or bank account</option>
              {catalog.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {accountKindLabels[account.kind] ?? account.kind} · {formatTaka(account.balance)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Project
            <select className={`${fieldClass} mt-1.5`} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">No project</option>
              {catalog.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
          Recurring expense
        </label>
        {recurring ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Frequency
              <select className={`${fieldClass} mt-1.5`} value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}>
                {frequencies.map((item) => (
                  <option key={item} value={item}>
                    {frequencyLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Next due date
              <input className={`${fieldClass} mt-1.5`} type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} required />
            </label>
          </div>
        ) : null}
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || catalog.accounts.length === 0}>
            {pending ? "Saving…" : "Save expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
