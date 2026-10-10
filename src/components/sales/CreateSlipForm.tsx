import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { createSlipSerial, saveManualSlip, validSlipAmount, validSlipPhone, type SlipKind } from "@/lib/manualSlip";
import { methodLabel, paymentMethods, type CatalogUnit, type PaymentMethod } from "@/lib/sales";

const inputClass = `${fieldClass} mt-1.5 bg-white`;

function localDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function localTime(date: Date) {
  return date.toTimeString().slice(0, 5);
}

export function CreateSlipForm({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const now = new Date();
  const [kind, setKind] = useState<SlipKind>("payment");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(localDate(now));
  const [time, setTime] = useState(localTime(now));
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<CatalogUnit[]>([]);
  const [projectId, setProjectId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const projectOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const project of projects) names.set(project.id, project.name);
    for (const unit of units) names.set(unit.projectId, unit.projectName);
    return [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [projects, units]);
  const unitOptions = units.filter((unit) => unit.projectId === projectId);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ projects: { id: string; name: string }[] }>("/api/projects"),
      api<{ units: CatalogUnit[] }>("/api/sales/catalog"),
    ]).then(([projectResult, unitResult]) => {
      if (!active) return;
      if (projectResult.ok) setProjects(projectResult.data.projects);
      if (unitResult.ok) setUnits(unitResult.data.units);
      if (!projectResult.ok && !unitResult.ok) setError(projectResult.error);
    });
    return () => {
      active = false;
    };
  }, []);

  function chooseProject(id: string) {
    setProjectId(id);
    setUnitId("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = buyerName.trim();
    const phone = validSlipPhone(buyerPhone);
    const money = validSlipAmount(amount);
    if (!name) {
      setError("Enter the buyer name.");
      return;
    }
    if (!phone) {
      setError("Enter the buyer phone number.");
      return;
    }
    if (!money) {
      setError("Enter an amount greater than 0.00.");
      return;
    }
    const issued = new Date(`${date}T${time || "00:00"}`);
    if (Number.isNaN(issued.getTime())) {
      setError("Enter a valid date and time.");
      return;
    }
    const project = projectOptions.find((item) => item.id === projectId);
    const unit = unitOptions.find((item) => item.id === unitId);
    const slip = {
      id: crypto.randomUUID(),
      serial: createSlipSerial(kind),
      kind,
      buyerName: name,
      buyerPhone: phone,
      amount: money,
      method,
      issuedAt: issued.toISOString(),
      note: note.trim(),
      projectName: project?.name ?? "",
      unitNumber: unit ? `${unit.number} · ${unit.type}` : "",
    };
    saveManualSlip(slip);
    onClose();
    navigate(`/payments/slips/${slip.id}`);
  }

  return (
    <Dialog title="New slip" onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f8fafc] p-1">
          <button type="button" aria-pressed={kind === "payment"} onClick={() => setKind("payment")} className={`h-11 rounded-xl text-sm font-semibold ${kind === "payment" ? "bg-[#0f766e] text-white" : "text-[#52616b]"}`}>
            Payment
          </button>
          <button type="button" aria-pressed={kind === "refund"} onClick={() => setKind("refund")} className={`h-11 rounded-xl text-sm font-semibold ${kind === "refund" ? "bg-[#c2410c] text-white" : "text-[#52616b]"}`}>
            Refund
          </button>
        </div>
        <p className={`rounded-2xl px-4 py-3 text-sm ${kind === "refund" ? "bg-[#fff7ed] text-[#9a3412]" : "bg-[#f0fdfa] text-[#115e59]"}`}>
          {kind === "refund"
            ? "Buyer name and phone are required. This refund slip is a document and is not taken out of collected money."
            : "Buyer name and phone are required. This payment slip is a document and is not added to collected money."}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="grid gap-3 rounded-2xl border border-[#e6ebef] bg-[#f8fafc] p-4">
            <h3 className="text-sm font-semibold text-[#16302c]">Buyer</h3>
            <label className="text-sm font-medium">
              Buyer name
              <input className={inputClass} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Buyer full name" autoFocus />
            </label>
            <label className="text-sm font-medium">
              Phone number
              <input className={inputClass} inputMode="tel" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} placeholder="01XXXXXXXXX" />
            </label>
          </section>
          <section className={`grid gap-3 rounded-2xl border p-4 ${kind === "refund" ? "border-[#fed7aa] bg-[#fffaf5]" : "border-[#a7f3d0] bg-[#f0fdf8]"}`}>
            <h3 className="text-sm font-semibold text-[#16302c]">Money</h3>
            <label className="text-sm font-medium">
              Amount (৳)
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            </label>
            <label className="text-sm font-medium">
              Method
              <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                {paymentMethods.map((item) => (
                  <option key={item} value={item}>
                    {methodLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </div>
        <section className="grid gap-3 rounded-2xl border border-[#e6ebef] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#16302c]">When and where</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Date
              <input className={inputClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="text-sm font-medium">
              Time
              <input className={inputClass} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
            <label className="text-sm font-medium">
              Project
              <select className={inputClass} value={projectId} onChange={(event) => chooseProject(event.target.value)}>
                <option value="">Choose a project</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Unit
              <select className={inputClass} value={unitId} onChange={(event) => setUnitId(event.target.value)} disabled={!projectId}>
                <option value="">{projectId ? "Choose a unit" : "Choose a project first"}</option>
                {unitOptions.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.number} · {unit.type}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <label className="text-sm font-medium">
          Note
          <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder={kind === "refund" ? "Why the money is being returned" : "Reference or anything to print on the slip"} />
        </label>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className={kind === "refund" ? "bg-[#c2410c] hover:bg-[#9a3412]" : undefined}>
            {kind === "refund" ? "Create refund slip" : "Create slip"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
