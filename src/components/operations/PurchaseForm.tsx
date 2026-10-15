import { type DragEvent, type FormEvent, useEffect, useState } from "react";
import { Building2, FileText, ImagePlus, Wallet, X } from "lucide-react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { accountKindLabels } from "@/lib/finance";
import { formatTaka } from "@/lib/money";
import { type ExpenseDetail } from "@/lib/operations";
import { paymentMethods, paymentMethodLabels } from "@/lib/sales";

const fallbackTypes = ["Land purchase", "Materials", "Construction", "Legal & registration", "Transport"];
const maxBytes = 1_500_000;
const inputClass = `${fieldClass} mt-1.5 bg-white focus:border-[#c2410c]`;

type QueuedFile = { id: string; file: File; preview: string | null };

type Catalog = {
  projects: { id: string; name: string }[];
  accounts: { id: string; name: string; kind: string; balance: string }[];
  purchaseTypes?: { id: string; name: string }[];
};

export function PurchaseForm({
  initialType,
  onClose,
  onSaved,
}: {
  initialType?: string;
  onClose: () => void;
  onSaved: (expense: ExpenseDetail, warning?: string) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog>({ projects: [], accounts: [] });
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(initialType || fallbackTypes[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof paymentMethods)[number]>("bank");
  const [accountId, setAccountId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<Catalog>("/api/expenses/catalog").then((result) => {
      if (!result.ok) return;
      setCatalog(result.data);
      const names = (result.data.purchaseTypes ?? []).map((type) => type.name);
      if (names.length === 0) return;
      setCategory((current) => (names.includes(current) ? current : names.includes(initialType ?? "") ? initialType! : names[0]));
    });
  }, [initialType]);

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    if (!accountId) {
      setPending(false);
      setError("Choose the cash or bank account this purchase is paid from.");
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
        note: [reference.trim() ? `Ref ${reference.trim()}` : "", note.trim()].filter(Boolean).join(" · "),
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
    onSaved(result.data.expense, problems.length ? `Purchase added. ${problems.join(" ")}` : undefined);
  }

  const paidFrom = catalog.accounts.find((account) => account.id === accountId);

  return (
    <Dialog title="Add purchase" onClose={onClose} wide>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <p className="rounded-2xl bg-[#fff7ed] px-4 py-3 text-sm leading-6 text-[#9a3412]">
          Money leaves the account you choose below. A purchase of ৳50,000.00 or more waits until someone else approves it.
        </p>

        <section className="rounded-2xl border border-[#fed7aa] bg-[#fffaf5] p-4">
          <Step label="1 · Purchase" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(catalog.purchaseTypes?.length ? catalog.purchaseTypes.map((type) => type.name) : fallbackTypes).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`rounded-xl border px-2 py-2 text-center text-xs font-semibold ${category === item ? "border-[#c2410c] bg-white text-[#9a3412] shadow-[0_4px_12px_rgba(194,65,12,0.12)]" : "border-transparent bg-white/80 text-[#9a3412]/80"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="text-sm font-medium text-[#7c2d12]">
              Date
              <input className={inputClass} type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} required />
            </label>
            <label className="text-sm font-medium text-[#7c2d12]">
              What was bought
              <input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cement, steel, deed fee…" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
          <Step label="2 · Payment" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#92400e]">
              Amount (৳)
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
            </label>
            <label className="text-sm font-medium text-[#92400e]">
              Payment method
              <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
                {paymentMethods.map((item) => (
                  <option key={item} value={item}>
                    {paymentMethodLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[#92400e] sm:col-span-2">
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                Paid from
              </span>
              <select className={inputClass} value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                <option value="">Select cash or bank account</option>
                {catalog.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {accountKindLabels[account.kind] ?? account.kind} · {formatTaka(account.balance)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {paidFrom ? (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-[#92400e]">
              {paidFrom.name} has {formatTaka(paidFrom.balance)} now. This purchase is taken from that balance.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#e9e4f5] bg-[#faf8ff] p-4">
          <Step label="3 · Project and notes" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#3730a3] sm:col-span-2">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                Project
              </span>
              <select className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">No project</option>
                {catalog.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[#3730a3]">
              Reference
              <input className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Cheque no. or voucher" />
            </label>
            <label className="text-sm font-medium text-[#3730a3]">
              Notes
              <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Any extra detail" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#fed7aa] bg-white p-4">
          <Step label="4 · Slips" />
          <label
            className={`mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-4 ${dragging ? "border-[#c2410c] bg-[#fff7ed]" : "border-[#fdba74] bg-[#fffaf5]"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ffedd5] text-[#c2410c]">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#9a3412]">Add slip images or PDF</span>
              <span className="mt-0.5 block text-xs text-[#c2410c]">Click or drop several files at once</span>
            </span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(event) => {
                queue(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {queued.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {queued.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-xl border border-[#fed7aa] bg-[#fffaf5] px-2 py-2 text-sm">
                  {item.preview ? (
                    <img src={item.preview} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#fff1f2] text-[#9f1239]">
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

        <FieldError message={error} />
        <div className="flex justify-end gap-2 border-t border-[#ffedd5] pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-[#c2410c] hover:bg-[#9a3412]" disabled={pending}>
            {pending ? "Saving…" : "Add purchase"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Step({ label }: { label: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c2410c]">{label}</p>;
}

function contentTypeOf(file: File) {
  const name = file.name.toLowerCase();
  if (file.type === "image/png" || name.endsWith(".png")) return "image/png";
  if (file.type === "image/webp" || name.endsWith(".webp")) return "image/webp";
  if (file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  return "";
}

async function uploadQueued(expenseId: string, queued: QueuedFile[]) {
  const problems: string[] = [];
  for (const item of queued) {
    const contentType = contentTypeOf(item.file);
    if (!contentType || item.file.size > maxBytes) {
      problems.push(`${item.file.name} was skipped.`);
      continue;
    }
    const data = await item.file.arrayBuffer().then((buffer) => bytesToBase64(new Uint8Array(buffer)));
    const result = await api(`/api/files`, {
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
