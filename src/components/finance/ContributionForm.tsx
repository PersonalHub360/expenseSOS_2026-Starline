import { type DragEvent, type FormEvent, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { type InvestmentRow } from "@/lib/finance";
import { compareMoney } from "@/lib/money";
import { paymentMethodLabels, paymentMethods, type PaymentMethod } from "@/lib/sales";

type QueuedFile = { id: string; file: File; preview: string };

const maxBytes = 1_500_000;

export function ContributionForm({
  investors,
  categories,
  editing,
  onClose,
  onSaved,
}: {
  investors: string[];
  categories: string[];
  editing?: InvestmentRow | null;
  onClose: () => void;
  onSaved: (warning?: string) => void;
}) {
  const names = [...new Set([editing?.investorName.trim() ?? "", ...investors].filter(Boolean))];
  const categoryOptions = [...new Set([editing?.purpose.trim() ?? "", ...categories].filter(Boolean))];
  const amountLocked = editing ? compareMoney(editing.returned, "0.00") > 0 : false;
  const [investorName, setInvestorName] = useState(editing?.investorName ?? "");
  const [amount, setAmount] = useState(editing?.received ?? "");
  const [method, setMethod] = useState<PaymentMethod>(asMethod(editing?.method));
  const [investedOn, setInvestedOn] = useState(editing ? editing.investedAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(editing?.purpose ?? "");
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function queue(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next = [...list].flatMap((file) => {
      const type = contentTypeOf(file);
      if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") return [];
      return [{ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }];
    });
    if (next.length === 0) {
      setError("Use PNG, JPG, or WEBP images.");
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
    if (!editing && !investorName.trim()) {
      setError("Select an investor.");
      return;
    }
    setPending(true);
    setError("");
    const body = {
      investorName,
      amount,
      expectedReturn: editing?.expectedReturn ?? "0",
      investedOn,
      ...(editing?.project?.id ? { projectId: editing.project.id } : {}),
      purpose: category,
      method,
      note,
      reference,
    };
    const result = editing
      ? await api<{ investment: InvestmentRow }>(`/api/investments/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await api<{ investment: InvestmentRow }>("/api/investments", { method: "POST", body: JSON.stringify(body) });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    const problems = await uploadQueued(result.data.investment.id, queued);
    for (const item of queued) URL.revokeObjectURL(item.preview);
    setPending(false);
    const saved = editing ? "Contribution updated." : "Contribution recorded.";
    onSaved(problems.length ? `${saved} ${problems.join(" ")}` : undefined);
  }

  return (
    <Dialog title={editing ? "Edit contribution" : "Record Contribution"} onClose={onClose} wide>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <FieldLabel>Investor</FieldLabel>
            <select className={`${fieldClass} mt-1.5`} value={investorName} onChange={(event) => setInvestorName(event.target.value)} required={!editing}>
              <option value="">Select investor...</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <FieldLabel>Amount (BDT)</FieldLabel>
            <input className={`${fieldClass} mt-1.5`} inputMode="decimal" placeholder="e.g. 5000" value={amount} onChange={(event) => setAmount(event.target.value)} required readOnly={amountLocked} />
            {amountLocked ? <span className="mt-1 block text-xs text-[#64748b]">Amount stays fixed because a return is already recorded.</span> : null}
          </label>
          <label className="text-sm">
            <FieldLabel>Payment method</FieldLabel>
            <select className={`${fieldClass} mt-1.5`} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {paymentMethods.map((item) => (
                <option key={item} value={item}>
                  {paymentMethodLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <FieldLabel>Contribution date</FieldLabel>
            <input className={`${fieldClass} mt-1.5`} type="date" value={investedOn} onChange={(event) => setInvestedOn(event.target.value)} required />
          </label>
        </div>
        <label className="text-sm">
          <FieldLabel>Category</FieldLabel>
          <select className={`${fieldClass} mt-1.5`} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Select category...</option>
            {categoryOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <FieldLabel>Reference (optional)</FieldLabel>
          <input className={`${fieldClass} mt-1.5`} placeholder="e.g. Wire ref, cheque no." value={reference} onChange={(event) => setReference(event.target.value)} />
        </label>
        <label className="text-sm">
          <FieldLabel>Notes (optional)</FieldLabel>
          <input className={`${fieldClass} mt-1.5`} placeholder="Any additional notes..." value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div>
          <FieldLabel>Attachments / receipt images</FieldLabel>
          <label
            className={`mt-1.5 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed px-4 py-8 text-center ${dragging ? "border-[#7c3aed] bg-[#f5f3ff]" : "border-[#ddd6fe] bg-[#faf8ff]"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#ede9fe] text-[#7c3aed]">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span className="mt-3 text-sm font-semibold text-[#1e1b4b]">Click to upload or drag & drop</span>
            <span className="mt-1 text-xs text-[#94a3b8]">PNG, JPG, WEBP — multiple files supported</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
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
                <li key={item.id} className="flex items-center gap-2 rounded-xl border border-[#ede9fe] bg-white px-2 py-2 text-sm">
                  <img src={item.preview} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => {
                      URL.revokeObjectURL(item.preview);
                      setQueued((current) => current.filter((entry) => entry.id !== item.id));
                    }}
                  >
                    <X className="h-4 w-4 text-[#64748b]" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-[#8b5cf6] hover:bg-[#7c3aed]" disabled={pending || (!editing && names.length === 0)}>
            {editing ? "Save changes" : "Record Contribution"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">{children}</span>;
}

async function uploadQueued(subjectId: string, queued: QueuedFile[]) {
  const problems: string[] = [];
  for (const item of queued) {
    if (item.file.size > maxBytes) {
      problems.push(`${item.file.name} is larger than 1.5 MB.`);
      continue;
    }
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    const result = await api("/api/files", {
      method: "POST",
      body: JSON.stringify({
        subjectType: "investment",
        subjectId,
        title: `Receipt · ${item.file.name}`.slice(0, 120),
        fileName: item.file.name,
        contentType: contentTypeOf(item.file),
        data: btoa(binary),
      }),
    });
    if (!result.ok) problems.push(`${item.file.name}: ${result.error}`);
  }
  return problems;
}

function asMethod(value: string | undefined): PaymentMethod {
  if (value && paymentMethods.includes(value as PaymentMethod)) return value as PaymentMethod;
  return "bank";
}

function contentTypeOf(file: File) {
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return file.type || "application/octet-stream";
}
