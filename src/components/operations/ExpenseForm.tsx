import { type DragEvent, type FormEvent, useEffect, useState } from "react";
import { Building2, CalendarDays, FileText, ImagePlus, Repeat, Wallet, X } from "lucide-react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { expenseCategories, frequencies, frequencyLabels, type ExpenseDetail } from "@/lib/operations";
import { formatTaka } from "@/lib/money";
import { accountKindLabels } from "@/lib/finance";
import { paymentMethods, paymentMethodLabels } from "@/lib/sales";
import { cn } from "@/lib/utils";

const inputClass = `${fieldClass} mt-1.5 bg-white focus:border-[#ea580c]`;
const maxBytes = 1_500_000;

type QueuedFile = { id: string; file: File; preview: string | null };

type Catalog = {
  projects: { id: string; name: string }[];
  accounts: { id: string; name: string; kind: string; balance: string }[];
  categories: string[];
};

export function ExpenseForm({ onClose, onSaved }: { onClose: () => void; onSaved: (expense: ExpenseDetail, warning?: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog>({ projects: [], accounts: [], categories: [] });
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
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function queue(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next = [...list].flatMap((file) => {
      const type = contentTypeOf(file);
      if (!type) return [];
      return [{ id: crypto.randomUUID(), file, preview: type.startsWith("image/") ? URL.createObjectURL(file) : null }];
    });
    if (next.length === 0) {
      setError("Use PNG, JPG, WEBP, or PDF slips.");
      return;
    }
    setQueued((current) => [...current, ...next]);
    setError("");
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    queue(event.dataTransfer.files);
  }

  useEffect(() => {
    api<Catalog>("/api/expenses/catalog").then((result) => {
      if (!result.ok) return;
      setCatalog(result.data);
      const names = result.data.categories.length ? result.data.categories : [...expenseCategories];
      setCategory((current) => (names.includes(current) ? current : names[0]));
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
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    const problems = await uploadQueued(result.data.expense.id, queued);
    for (const item of queued) {
      if (item.preview) URL.revokeObjectURL(item.preview);
    }
    setPending(false);
    onSaved(result.data.expense, problems.length ? problems.join(" ") : undefined);
  }

  const names = catalog.categories.length ? catalog.categories : [...expenseCategories];

  return (
    <Dialog title="Record expense" onClose={onClose} wide>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <p className="rounded-2xl bg-gradient-to-r from-[#fff7ed] to-[#fff1f2] px-4 py-3 text-sm leading-6 text-[#9a3412]">
          The amount is taken from the selected cash or bank account. Amounts of ৳50,000.00 or more are taken after someone else approves them.
        </p>

        <section className="rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4">
          <SectionTitle icon={CalendarDays} title="What was spent" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#7c2d12]">
              Date
              <input className={inputClass} type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} required />
            </label>
            <label className="text-sm font-medium text-[#7c2d12] sm:col-span-2">
              Description
              <input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cement, wages, transport…" />
            </label>
          </div>
          <p className="mt-3 text-sm font-medium text-[#7c2d12]">Category</p>
          <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-auto">
            {names.map((item) => (
              <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={chip(category === item)}>
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#fecdd3] bg-[#fff1f2] p-4">
          <SectionTitle icon={Wallet} title="Money" tone="bg-[#ffe4e6] text-[#be185d]" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#9f1239]">
              Amount (৳)
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
            </label>
            <div>
              <p className="text-sm font-medium text-[#9f1239]">Payment method</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {paymentMethods.map((item) => (
                  <button key={item} type="button" aria-pressed={method === item} onClick={() => setMethod(item)} className={chip(method === item, "rose")}>
                    {paymentMethodLabels[item]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-[#9f1239]">Paid from</p>
          {catalog.accounts.length === 0 ? (
            <p className="mt-2 text-sm text-[#9f1239]">Add a cash or bank account before recording an expense.</p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {catalog.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  aria-pressed={accountId === account.id}
                  onClick={() => setAccountId(account.id)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left",
                    accountId === account.id ? "border-[#be185d] bg-white shadow-[0_8px_20px_rgba(190,24,93,0.12)]" : "border-[#fecdd3] bg-white/70",
                  )}
                >
                  <span className="block font-semibold text-[#9f1239]">{account.name}</span>
                  <span className="mt-1 block text-xs text-[#be185d]">{accountKindLabels[account.kind] ?? account.kind}</span>
                  <span className="mt-1 block text-sm font-semibold text-[#9a3412]">{formatTaka(account.balance)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
          <SectionTitle icon={Building2} title="Project" tone="bg-[#fef3c7] text-[#b45309]" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" aria-pressed={projectId === ""} onClick={() => setProjectId("")} className={chip(projectId === "", "amber")}>
              No project
            </button>
            {catalog.projects.map((project) => (
              <button key={project.id} type="button" aria-pressed={projectId === project.id} onClick={() => setProjectId(project.id)} className={chip(projectId === project.id, "amber")}>
                {project.name}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff] p-4">
          <SectionTitle icon={ImagePlus} title="Slips" tone="bg-[#ede9fe] text-[#6d28d9]" />
          <p className="mt-2 text-sm text-[#5b21b6]">Add several photos or PDFs. Slips stay with this expense and are not added to the amount.</p>
          <label
            className={`mt-3 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed bg-white px-4 py-6 text-center ${dragging ? "border-[#7c3aed]" : "border-[#c4b5fd]"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ede9fe] text-[#6d28d9]">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span className="mt-2 text-sm font-semibold text-[#5b21b6]">Click to upload or drag and drop</span>
            <span className="mt-1 text-xs text-[#7c3aed]">PNG, JPG, WEBP, or PDF — several slips at once, 1.5 MB each</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              aria-label="Add expense slips"
              onChange={(event) => {
                queue(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {queued.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {queued.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-xl border border-[#ddd6fe] bg-white px-2 py-2 text-sm">
                  {item.preview ? (
                    <img src={item.preview} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#f5f3ff] text-[#6d28d9]">
                      <FileText className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => {
                      if (item.preview) URL.revokeObjectURL(item.preview);
                      setQueued((current) => current.filter((entry) => entry.id !== item.id));
                    }}
                  >
                    <X className="h-4 w-4 text-[#64748b]" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle icon={Repeat} title="Repeat" tone="bg-[#e2e8f0] text-[#334155]" />
            <button type="button" aria-pressed={recurring} onClick={() => setRecurring((current) => !current)} className={chip(recurring, "slate")}>
              {recurring ? "On" : "Off"}
            </button>
          </div>
          {recurring ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-[#334155]">Frequency</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {frequencies.map((item) => (
                    <button key={item} type="button" aria-pressed={frequency === item} onClick={() => setFrequency(item)} className={chip(frequency === item, "slate")}>
                      {frequencyLabels[item]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="text-sm font-medium text-[#334155]">
                Next due date
                <input className={inputClass} type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} required />
              </label>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#64748b]">Turn this on for a monthly, quarterly, or yearly expense.</p>
          )}
        </section>

        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-[#c2410c] hover:bg-[#9a3412]" disabled={pending || catalog.accounts.length === 0}>
            {pending ? "Saving…" : "Save expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SectionTitle({ icon: Icon, title, tone = "bg-[#ffedd5] text-[#c2410c]" }: { icon: typeof CalendarDays; title: string; tone?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-sm font-semibold text-[#1e293b]">{title}</h3>
    </div>
  );
}

function contentTypeOf(file: File) {
  const name = file.name.toLowerCase();
  if (file.type === "image/png" || name.endsWith(".png")) return "image/png";
  if (file.type === "image/webp" || name.endsWith(".webp")) return "image/webp";
  if (file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  return "";
}

async function uploadQueued(expenseId: string, files: QueuedFile[]) {
  const problems: string[] = [];
  for (const item of files) {
    const contentType = contentTypeOf(item.file);
    if (!contentType || item.file.size > maxBytes) {
      problems.push(`${item.file.name} was skipped.`);
      continue;
    }
    const data = await item.file.arrayBuffer().then((buffer) => bytesToBase64(new Uint8Array(buffer)));
    const result = await api("/api/files", {
      method: "POST",
      body: JSON.stringify({
        subjectType: "expense",
        subjectId: expenseId,
        title: `Slip · ${item.file.name}`,
        fileName: item.file.name,
        contentType,
        data,
      }),
    });
    if (!result.ok) problems.push(`${item.file.name}: ${result.error}`);
  }
  return problems;
}

function bytesToBase64(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
}

function chip(active: boolean, tone: "orange" | "rose" | "amber" | "slate" = "orange") {
  const on = {
    orange: "bg-[#c2410c] text-white",
    rose: "bg-[#be185d] text-white",
    amber: "bg-[#b45309] text-white",
    slate: "bg-[#334155] text-white",
  }[tone];
  return cn("rounded-full px-3 py-1.5 text-xs font-semibold", active ? on : "bg-white text-[#334155] ring-1 ring-[#e2e8f0]");
}
