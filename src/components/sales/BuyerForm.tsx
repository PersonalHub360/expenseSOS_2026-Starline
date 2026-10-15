import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, FileText, ImagePlus, UserRound, X } from "lucide-react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { installmentYearChoices, planInstallments, yearsFromSchedule } from "@/lib/installmentPlan";
import { formatTaka } from "@/lib/money";
import { buyerDealStatusLabels, buyerDealStatuses, type BuyerProfile } from "@/lib/sales";
import { cn } from "@/lib/utils";

type BuyerFormProps = {
  buyer?: BuyerProfile | null;
  onClose: () => void;
  onSaved: (warning?: string) => void;
};

type QueuedFile = { id: string; file: File; preview: string | null };

const maxBytes = 1_500_000;
const areaClass =
  "mt-1.5 min-h-16 w-full rounded-xl border border-[#e6ebef] bg-white px-3 py-2 text-sm outline-none focus:border-[#be123c]";
const inputClass = `${fieldClass} mt-1.5 bg-white focus:border-[#be123c]`;

export function BuyerForm({ buyer, onClose, onSaved }: BuyerFormProps) {
  const editing = Boolean(buyer);
  const [name, setName] = useState(buyer?.name ?? "");
  const [phone, setPhone] = useState(buyer?.phone ?? "");
  const [email, setEmail] = useState(buyer?.email ?? "");
  const [address, setAddress] = useState(buyer?.address ?? "");
  const [notes, setNotes] = useState(buyer?.notes ?? "");
  const [projectName, setProjectName] = useState(buyer?.projectName ?? "");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [flatAmount, setFlatAmount] = useState(buyer?.flatAmount ?? "");
  const [size, setSize] = useState(buyer?.size ?? "");
  const [installmentPayment, setInstallmentPayment] = useState(buyer?.installmentPayment ?? "");
  const [years, setYears] = useState(yearsFromSchedule(buyer?.installmentSchedule ?? ""));
  const legacySchedule = buyer?.installmentSchedule === "monthly" || buyer?.installmentSchedule === "yearly" ? buyer.installmentSchedule : "";
  const plan = useMemo(
    () => (years ? planInstallments(flatAmount, installmentPayment, years) : null),
    [flatAmount, installmentPayment, years],
  );
  const [paymentAlertOn, setPaymentAlertOn] = useState(buyer?.paymentAlertOn ?? "");
  const [dealStatus, setDealStatus] = useState(buyer ? buyer.dealStatus : "booking");
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ projects: { id: string; name: string }[] }>("/api/projects").then((result) => {
      if (active && result.ok) setProjects(result.data.projects);
    });
    return () => {
      active = false;
    };
  }, []);

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
    if (!name.trim()) {
      setError("Enter the buyer name.");
      return;
    }
    if (years && !plan) {
      setError("Enter a flat price and a downpayment that is not more than the price.");
      return;
    }
    setPending(true);
    setError("");
    const result = await api<{ buyer: BuyerProfile }>(buyer ? `/api/buyers/${buyer.id}` : "/api/buyers", {
      method: buyer ? "PATCH" : "POST",
      body: JSON.stringify({
        name,
        phone,
        email,
        address,
        notes,
        projectName,
        flatAmount,
        size,
        installmentPayment,
        installmentAmount: plan ? (plan.months === 0 ? "" : plan.regular) : (buyer?.installmentAmount ?? ""),
        installmentSchedule: years ? String(years) : legacySchedule,
        paymentAlertOn,
        dealStatus,
      }),
    });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    const problems = await uploadQueued(result.data.buyer.id, queued);
    for (const item of queued) {
      if (item.preview) URL.revokeObjectURL(item.preview);
    }
    setPending(false);
    onSaved(problems.length ? `Buyer saved. ${problems.join(" ")}` : undefined);
  }

  return (
    <Dialog title={editing ? "Edit buyer" : "New buyer"} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#fecdd3] bg-[#fff7f8] p-4">
            <SectionTitle icon={UserRound} title="Contact" tone="text-[#be123c] bg-[#ffe4e6]" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Name
                <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Buyer full name" required autoFocus />
              </label>
              <label className="text-sm font-medium">
                Phone number
                <input className={inputClass} value={phone} inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" />
              </label>
              <label className="text-sm font-medium">
                Email
                <input className={inputClass} value={email} inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="name@email.com" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Address
                <input className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House, road, area" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-[#ddd6fe] bg-[#faf5ff] p-4">
            <SectionTitle icon={Building2} title="Flat" tone="text-[#6d28d9] bg-[#ede9fe]" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Project name
                <select className={inputClass} value={projectName} onChange={(event) => setProjectName(event.target.value)}>
                  <option value="">Choose a project</option>
                  {projectName && !projects.some((project) => project.name === projectName) ? <option value={projectName}>{projectName}</option> : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.name}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Flat size
                <input className={inputClass} value={size} onChange={(event) => setSize(event.target.value)} placeholder="1200 sqft" />
              </label>
              <label className="text-sm font-medium">
                Flat price (৳)
                <input className={inputClass} inputMode="decimal" value={flatAmount} onChange={(event) => setFlatAmount(event.target.value)} placeholder="0.00" />
              </label>
            </div>
            <p className="mt-3 text-sm font-medium">Status</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {buyerDealStatuses.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={dealStatus === item}
                  onClick={() => setDealStatus(item)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${dealStatus === item ? statusOn[item] : "bg-white text-[#64748b] ring-1 ring-[#e6ebef]"}`}
                >
                  {buyerDealStatusLabels[item]}
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
          <SectionTitle icon={CalendarClock} title="Installment" tone="text-[#047857] bg-[#dcfce7]" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Downpayment (৳)
              <input className={inputClass} inputMode="decimal" value={installmentPayment} onChange={(event) => setInstallmentPayment(event.target.value)} placeholder="0.00" />
            </label>
            <label className="text-sm font-medium">
              Payment alert
              <input className={inputClass} type="date" value={paymentAlertOn} onChange={(event) => setPaymentAlertOn(event.target.value)} />
            </label>
          </div>
          <p className="mt-3 text-sm font-medium">Installment type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {installmentYearChoices.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={years === choice}
                onClick={() => setYears(years === choice ? 0 : choice)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  years === choice ? "bg-[#047857] text-white" : "bg-white text-[#047857] ring-1 ring-[#bbf7d0]",
                )}
              >
                {choice} {choice === 1 ? "year" : "years"}
              </button>
            ))}
          </div>
          {legacySchedule && !years ? (
            <p className="mt-2 text-xs text-[#166534]">Earlier plan was saved as {legacySchedule}. Choose a year to replace it.</p>
          ) : null}
          <div className="mt-3 grid gap-2 rounded-xl bg-white p-3 sm:grid-cols-3">
            <PlanFact label="Balance" value={plan ? formatTaka(plan.remaining) : "—"} />
            <PlanFact label="Months" value={plan && plan.months > 0 ? String(plan.months) : "—"} />
            <PlanFact label="Monthly installment" value={plan && plan.months > 0 ? formatTaka(plan.regular) : "—"} />
          </div>
          {plan?.uneven ? <p className="mt-2 text-xs text-[#166534]">The last month is {formatTaka(plan.last)} so the months add up to the balance.</p> : null}
          {plan?.months === 0 ? <p className="mt-2 text-xs text-[#166534]">The downpayment covers the flat price.</p> : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="rounded-2xl border border-[#e6ebef] bg-[#f8fafc] p-4 text-sm font-medium">
            Notes
            <textarea className={areaClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="NID, reference, or anything the sales team should remember" />
          </label>
          <div className="rounded-2xl border border-[#fecdd3] bg-[#fff7f8] p-4">
            <p className="text-sm font-medium">Payment slips</p>
            <label
              className={`mt-1.5 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed px-4 py-5 text-center ${dragging ? "border-[#be123c] bg-white" : "border-[#fecdd3] bg-white"}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffe4e6] text-[#be123c]">
                <ImagePlus className="h-5 w-5" />
              </span>
              <span className="mt-2 text-sm font-semibold text-[#9f1239]">Click or drag several slips</span>
              <span className="mt-1 text-xs text-[#be123c]">PNG, JPG, WEBP, or PDF · up to 1.5 MB each</span>
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
              <ul className="mt-3 grid gap-2">
                {queued.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-xl border border-[#fecdd3] bg-white px-2 py-2 text-sm">
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
          </div>
        </div>

        <p className="text-xs text-[#94a3b8]">These amounts stay on the buyer. They are not added to sales or profit. Phone needs 6 to 15 digits, and email needs a real address, when entered.</p>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="bg-[#be123c] hover:bg-[#9f1239]" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Save buyer"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const statusOn: Record<string, string> = {
  booking: "bg-[#be123c] text-white",
  running: "bg-[#d97706] text-white",
  completed: "bg-[#047857] text-white",
  cancelled: "bg-[#475569] text-white",
};

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#166534]">{value}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, tone }: { icon: typeof UserRound; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`grid h-8 w-8 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <h3 className="text-sm font-semibold text-[#16302c]">{title}</h3>
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

async function uploadQueued(buyerId: string, queued: QueuedFile[]) {
  const problems: string[] = [];
  for (const item of queued) {
    const contentType = contentTypeOf(item.file);
    if (!contentType || item.file.size > maxBytes) {
      problems.push(`${item.file.name} was skipped.`);
      continue;
    }
    const data = await item.file.arrayBuffer().then((buffer) => bytesToBase64(new Uint8Array(buffer)));
    const result = await api("/api/files", {
      method: "POST",
      body: JSON.stringify({
        subjectType: "buyer",
        subjectId: buyerId,
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
