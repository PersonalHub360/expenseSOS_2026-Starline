import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { addMoney, formatTaka, normalizeMoney } from "@/lib/money";
import { projectStatusLabels, projectStatuses, type ProjectCore } from "@/lib/projects";

type ProjectFormProps = {
  project?: ProjectCore | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

type UnitStatus = "available" | "reserved" | "sold" | "cancelled";

type UnitDraft = {
  key: string;
  id: string;
  number: string;
  location: string;
  price: string;
  status: UnitStatus;
  note: string;
};

type FieldErrors = Partial<Record<"name" | "location" | "budget" | "date" | "units" | "form", string>>;

const unitStatusLabels: Record<UnitStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  cancelled: "Cancelled",
};

function blankUnit(location = ""): UnitDraft {
  return { key: crypto.randomUUID(), id: "", number: "", location, price: "", status: "available", note: "" };
}

function rowIsEmpty(unit: UnitDraft) {
  return !unit.number.trim() && !unit.price.trim() && !unit.note.trim() && !unit.location.trim();
}

export function ProjectForm({ project, onClose, onSaved }: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [date, setDate] = useState(project?.startDate ?? "");
  const [location, setLocation] = useState(project?.location ?? "");
  const [note, setNote] = useState(project?.description ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [price, setPrice] = useState(project ? project.budget : "");
  const [units, setUnits] = useState<UnitDraft[]>(() => (project ? [] : [blankUnit()]));
  const [unitsReady, setUnitsReady] = useState(!project);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!project) return;
    let active = true;
    api<{ units: { id: string; number: string; location: string; price: string; status: UnitStatus; note: string }[] }>(
      `/api/projects/${project.id}`,
    ).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setErrors({ form: result.error });
        return;
      }
      setUnits(
        result.data.units.length
          ? result.data.units.map((unit) => ({
              key: unit.id,
              id: unit.id,
              number: unit.number,
              location: unit.location,
              price: unit.price,
              status: unit.status,
              note: unit.note ?? "",
            }))
          : [blankUnit(project.location)],
      );
      setUnitsReady(true);
    });
    return () => {
      active = false;
    };
  }, [project]);

  const priced = units
    .filter((unit) => !rowIsEmpty(unit))
    .map((unit) => normalizeMoney(unit.price))
    .filter((amount): amount is string => Boolean(amount));
  const filledCount = units.filter((unit) => !rowIsEmpty(unit)).length;
  const total = priced.length === filledCount ? addMoney(priced) : null;

  function updateUnit(key: string, patch: Partial<UnitDraft>) {
    setUnits((current) => current.map((unit) => (unit.key === key ? { ...unit, ...patch } : unit)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Enter the project name.";
    if (!location.trim()) next.location = "Enter the location.";
    if (!normalizeMoney(price)) next.budget = "Enter the price in taka, with up to 2 decimal places.";
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "Use a real date.";
    const drafts = units.filter((unit) => !rowIsEmpty(unit));
    const numbers = new Set<string>();
    for (const unit of drafts) {
      if (!unit.number.trim()) next.units = "Enter each unit number.";
      else if (numbers.has(unit.number.trim().toLowerCase())) next.units = "Each unit number can be used once.";
      else if (!normalizeMoney(unit.price) || normalizeMoney(unit.price) === "0.00") next.units = "Enter a unit price greater than zero.";
      numbers.add(unit.number.trim().toLowerCase());
    }
    setErrors(next);
    if (Object.keys(next).length || !unitsReady) return;

    setPending(true);
    const payload = {
      name,
      location,
      description: note,
      startDate: date || null,
      endDate: project?.endDate ?? null,
      status,
      budget: price,
      staffIds: project?.staff.map((person) => person.id) ?? [],
      staff: [],
      units: drafts.map((unit) => ({
        id: unit.id,
        number: unit.number.trim(),
        location: unit.location.trim() || location.trim(),
        price: unit.price,
        status: unit.status,
        note: unit.note.trim(),
        size: "1",
        sizeUnit: "katha",
      })),
    };
    const result = await api<{ project: { id: string } }>(project ? `/api/projects/${project.id}` : "/api/projects", {
      method: project ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!result.ok) {
      setErrors({ form: result.error });
      return;
    }
    onSaved(result.data.project.id);
  }

  return (
    <Dialog title={project ? `Edit ${project.name}` : "New project"} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Project name
            <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} />
            <FieldError message={errors.name} />
          </label>
          <label className="text-sm font-medium">
            Date
            <input type="date" className={`${fieldClass} mt-1.5`} value={date} onChange={(event) => setDate(event.target.value)} />
            <FieldError message={errors.date} />
          </label>
          <label className="text-sm font-medium">
            Location
            <input className={`${fieldClass} mt-1.5`} value={location} onChange={(event) => setLocation(event.target.value)} />
            <FieldError message={errors.location} />
          </label>
          <label className="text-sm font-medium">
            Price
            <input inputMode="decimal" className={`${fieldClass} mt-1.5`} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" />
            <FieldError message={errors.budget} />
          </label>
          <label className="text-sm font-medium">
            Status
            <select className={`${fieldClass} mt-1.5`} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              {projectStatuses.map((item) => (
                <option key={item} value={item}>
                  {projectStatusLabels[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="text-sm font-medium">
          Note
          <textarea
            className="mt-1.5 min-h-20 w-full rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 py-2 text-sm outline-none focus:border-[#6d28d9]"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <section className="rounded-2xl border border-[#e7eef2] bg-[#f8fafc] p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Units</h3>
            <Button type="button" variant="secondary" onClick={() => setUnits((current) => [...current, blankUnit(location)])}>
              <Plus className="h-4 w-4" />
              Add unit
            </Button>
          </div>
          <p className="mt-1 text-xs text-[#64748b]">Add each unit number, such as 201, 401, 503, or 405.</p>
          {errors.units ? <p className="mt-2 text-sm text-[#b42318]">{errors.units}</p> : null}
          <div className="mt-3 space-y-3">
            {units.map((unit, index) => (
              <div key={unit.key} className="rounded-xl border border-[#e6ebef] bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Unit {index + 1}</p>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#be123c] hover:bg-[#fff1f2]"
                    onClick={() => setUnits((current) => current.filter((item) => item.key !== unit.key))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-sm font-medium">
                    Unit number
                    <input
                      className={`${fieldClass} mt-1.5`}
                      value={unit.number}
                      placeholder="201"
                      onChange={(event) => updateUnit(unit.key, { number: event.target.value })}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Location
                    <input
                      className={`${fieldClass} mt-1.5`}
                      value={unit.location}
                      placeholder={location || "Same as the project"}
                      onChange={(event) => updateUnit(unit.key, { location: event.target.value })}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Unit price
                    <input
                      inputMode="decimal"
                      className={`${fieldClass} mt-1.5`}
                      value={unit.price}
                      placeholder="0.00"
                      onChange={(event) => updateUnit(unit.key, { price: event.target.value })}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Status
                    <select
                      className={`${fieldClass} mt-1.5`}
                      value={unit.status}
                      onChange={(event) => updateUnit(unit.key, { status: event.target.value as UnitStatus })}
                    >
                      {(Object.keys(unitStatusLabels) as UnitStatus[]).map((item) => (
                        <option key={item} value={item}>
                          {unitStatusLabels[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium sm:col-span-2">
                    Note
                    <input className={`${fieldClass} mt-1.5`} value={unit.note} onChange={(event) => updateUnit(unit.key, { note: event.target.value })} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-between rounded-2xl bg-[#eef2ff] px-4 py-3 text-[#312e81]">
          <p className="text-sm font-semibold">Project total price</p>
          <p className="text-lg font-semibold tabular-nums">{total ? formatTaka(total) : "—"}</p>
        </div>

        {errors.form ? (
          <p role="alert" className="text-sm text-[#b42318]">
            {errors.form}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !unitsReady}>
            {pending ? "Saving…" : "Save project"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
