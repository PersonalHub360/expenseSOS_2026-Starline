import { FormEvent, useEffect, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  projectStatusLabels,
  projectStatuses,
  type ProjectCore,
  type StaffMember,
} from "@/lib/projects";

type ProjectFormProps = {
  project?: ProjectCore | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

type FieldErrors = Partial<Record<"name" | "location" | "budget" | "endDate" | "form", string>>;

export function ProjectForm({ project, onClose, onSaved }: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [location, setLocation] = useState(project?.location ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [status, setStatus] = useState(project?.status ?? "planning");
  const [budget, setBudget] = useState(project ? project.budget : "");
  const [staffIds, setStaffIds] = useState<string[]>(project?.staff.map((person) => person.id) ?? []);
  const [directory, setDirectory] = useState<StaffMember[]>([]);
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [addedStaff, setAddedStaff] = useState<{ name: string; jobTitle: string }[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ staff: StaffMember[] }>("/api/projects/directory").then((result) => {
      if (active && result.ok) setDirectory(result.data.staff);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggleStaff(id: string) {
    setStaffIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Enter the project name.";
    if (!location.trim()) next.location = "Enter the location.";
    if (!/^\d+(\.\d{1,2})?$/.test(budget.trim())) next.budget = "Enter the budget in taka, with up to 2 decimal places.";
    if (startDate && endDate && endDate < startDate) next.endDate = "The end date cannot be before the start date.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const payload = {
      name,
      location,
      description,
      startDate: startDate || null,
      endDate: endDate || null,
      status,
      budget,
      staffIds,
      staff: addedStaff,
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
    <Dialog title={project ? "Edit project" : "New project"} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="text-sm font-medium">
          Project name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} />
          <FieldError message={errors.name} />
        </label>
        <label className="text-sm font-medium">
          Location
          <input className={`${fieldClass} mt-1.5`} value={location} onChange={(event) => setLocation(event.target.value)} />
          <FieldError message={errors.location} />
        </label>
        <label className="text-sm font-medium">
          Description
          <textarea
            className="mt-1.5 min-h-24 w-full rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 py-2 text-sm outline-none focus:border-[#1a9a84]"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Start date
            <input type="date" className={`${fieldClass} mt-1.5`} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="text-sm font-medium">
            End date
            <input type="date" className={`${fieldClass} mt-1.5`} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            <FieldError message={errors.endDate} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
          <label className="text-sm font-medium">
            Budget (৳)
            <input inputMode="decimal" className={`${fieldClass} mt-1.5`} value={budget} onChange={(event) => setBudget(event.target.value)} />
            <FieldError message={errors.budget} />
          </label>
        </div>
        <fieldset className="rounded-xl border border-[#e6ebef] p-3">
          <legend className="px-1 text-sm font-medium">Responsible staff</legend>
          <div className="mt-2 grid max-h-36 gap-2 overflow-auto">
            {directory.length === 0 ? (
              <p className="text-sm text-[#7d8b96]">No staff are in the directory yet.</p>
            ) : (
              directory.map((person) => (
                <label key={person.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={staffIds.includes(person.id)}
                    onChange={() => toggleStaff(person.id)}
                  />
                  <span>
                    {person.name}
                    {person.jobTitle ? <span className="text-[#7d8b96]"> · {person.jobTitle}</span> : null}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className={fieldClass} placeholder="Staff name" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <input className={fieldClass} placeholder="Role" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!newName.trim()) return;
                setAddedStaff((current) => [...current, { name: newName.trim(), jobTitle: newTitle.trim() }]);
                setNewName("");
                setNewTitle("");
              }}
            >
              Add
            </Button>
          </div>
          {addedStaff.length ? (
            <ul className="mt-2 text-sm text-[#5c6b76]">
              {addedStaff.map((person) => (
                <li key={`${person.name}-${person.jobTitle}`}>
                  {person.name}
                  {person.jobTitle ? ` · ${person.jobTitle}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
        {errors.form ? (
          <p role="alert" className="text-sm text-[#b42318]">
            {errors.form}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save project"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
