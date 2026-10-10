import { useMemo, useState } from "react";
import { Building2, MapPin, Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import { ProjectDialog } from "@/components/inventory/ProjectDialog";
import { UnitDialog } from "@/components/inventory/UnitDialog";
import { Button } from "@/components/ui/button";
import { useInventory } from "@/context/InventoryContext";
import {
  countByStatus,
  formatPrice,
  formatSize,
  statusLabels,
  typeLabels,
  unitStatuses,
  type PropertyUnit,
  type UnitStatus,
  type UnitType,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";

const statusTone: Record<UnitStatus, { chip: string; card: string; bar: string; count: string; active: string }> = {
  available: {
    chip: "bg-[#ccfbf1] text-[#0f766e]",
    card: "border-[#99f6e4] bg-gradient-to-br from-[#f0fdfa] to-white",
    bar: "from-[#0f766e] to-[#14b8a6]",
    count: "text-[#0f766e]",
    active: "ring-2 ring-[#0f766e]",
  },
  reserved: {
    chip: "bg-[#fef3c7] text-[#b45309]",
    card: "border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white",
    bar: "from-[#d97706] to-[#fbbf24]",
    count: "text-[#b45309]",
    active: "ring-2 ring-[#d97706]",
  },
  sold: {
    chip: "bg-[#dbeafe] text-[#1d4ed8]",
    card: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    bar: "from-[#2563eb] to-[#60a5fa]",
    count: "text-[#1d4ed8]",
    active: "ring-2 ring-[#2563eb]",
  },
  cancelled: {
    chip: "bg-[#ffe4e6] text-[#be123c]",
    card: "border-[#fecdd3] bg-gradient-to-br from-[#fff1f2] to-white",
    bar: "from-[#e11d48] to-[#fb7185]",
    count: "text-[#be123c]",
    active: "ring-2 ring-[#e11d48]",
  },
};

const typeTone: Record<UnitType, string> = {
  plot: "bg-[#ecfdf5] text-[#047857]",
  flat: "bg-[#f5f3ff] text-[#6d28d9]",
  unit: "bg-[#eff6ff] text-[#1d4ed8]",
};

export function PropertiesPage() {
  const { projects, units, deleteUnit } = useInventory();
  const [projectId, setProjectId] = useState<string>("all");
  const [status, setStatus] = useState<UnitStatus | "all">("all");
  const [type, setType] = useState<UnitType | "all">("all");
  const [query, setQuery] = useState("");
  const [projectDialog, setProjectDialog] = useState(false);
  const [unitDialog, setUnitDialog] = useState(false);
  const [editing, setEditing] = useState<PropertyUnit | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PropertyUnit | null>(null);

  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? "Unknown project";

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return units.filter((unit) => {
      if (projectId !== "all" && unit.projectId !== projectId) return false;
      if (status !== "all" && unit.status !== status) return false;
      if (type !== "all" && unit.type !== type) return false;
      if (!needle) return true;
      return [unit.number, unit.location, unit.buyerLabel, unit.bookingLabel, unit.saleLabel, projectName(unit.projectId)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [units, projectId, status, type, query, projects]);

  const selectedProject = projectId === "all" ? projects[0]?.id ?? "" : projectId;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#6d28d9] via-[#2563eb] to-[#0f766e] p-5 text-white shadow-[0_16px_40px_rgba(37,99,235,0.22)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Portfolio</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Properties/Units</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              Plots, flats, and units with size, location, price, and booking links.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="bg-white/15 text-white hover:bg-white/25" onClick={() => setProjectDialog(true)}>
              <Plus className="h-4 w-4" />
              Project
            </Button>
            <Button
              className="bg-white text-[#1d4ed8] hover:bg-[#eff6ff]"
              onClick={() => {
                setEditing(null);
                setUnitDialog(true);
              }}
              disabled={projects.length === 0}
            >
              <Plus className="h-4 w-4" />
              Unit
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {unitStatuses.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus((current) => (current === item ? "all" : item))}
            className={cn(
              "rounded-[22px] border px-4 py-3 text-left shadow-[0_10px_28px_rgba(22,40,36,0.04)]",
              statusTone[item].card,
              status === item && statusTone[item].active,
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{statusLabels[item]}</p>
            <p className={cn("mt-1 text-2xl font-semibold", statusTone[item].count)}>{countByStatus(units, item)}</p>
          </button>
        ))}
      </div>

      <section className="rounded-[24px] border border-[#e7eef2] bg-white p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <select
            aria-label="Filter by project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm lg:w-56"
          >
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by type"
            value={type}
            onChange={(event) => setType(event.target.value as UnitType | "all")}
            className="h-11 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm lg:w-40"
          >
            <option value="all">All types</option>
            <option value="plot">Plot</option>
            <option value="flat">Flat</option>
            <option value="unit">Unit</option>
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search units"
            placeholder="Search number, location, buyer"
            className="h-11 flex-1 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm outline-none focus:border-[#1a9a84]"
          />
        </div>

        {projects.length === 0 ? (
          <EmptyState
            title="Add a project first"
            detail="Units belong to a project. Create the project, then add its plots, flats, or units."
            action="New project"
            onAction={() => setProjectDialog(true)}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No units in this view"
            detail="Add a plot, flat, or unit, or clear the filters."
            action="Add unit"
            onAction={() => {
              setEditing(null);
              setUnitDialog(true);
            }}
          />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((unit) => (
              <article key={unit.id} className="overflow-hidden rounded-[22px] border border-[#e7eef2] bg-[#fbfcfd]">
                <div className={`h-1.5 bg-gradient-to-r ${statusTone[unit.status].bar}`} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-[#16302c]">{unit.number}</h2>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", typeTone[unit.type])}>
                          {typeLabels[unit.type]}
                        </span>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", statusTone[unit.status].chip)}>
                          {statusLabels[unit.status]}
                        </span>
                      </div>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#5c6b76]">
                        <Building2 className="h-3.5 w-3.5 text-[#2563eb]" aria-hidden="true" />
                        {projectName(unit.projectId)}
                      </p>
                    </div>
                    <p className="rounded-2xl bg-[#ecfdf5] px-3 py-2 text-sm font-semibold text-[#047857]">{formatPrice(unit.price)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#5c6b76]">
                    <span className="inline-flex items-center gap-1.5">
                      <Ruler className="h-3.5 w-3.5 text-[#7c3aed]" aria-hidden="true" />
                      {formatSize(unit.size, unit.sizeUnit)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#0f766e]" aria-hidden="true" />
                      {unit.location || "No location"}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <LinkChip label="Booking" value={unit.bookingLabel} tone="bg-[#fffbeb] text-[#b45309]" />
                    <LinkChip label="Buyer" value={unit.buyerLabel} tone="bg-[#f5f3ff] text-[#6d28d9]" />
                    <LinkChip label="Sale" value={unit.saleLabel} tone="bg-[#eff6ff] text-[#1d4ed8]" />
                  </dl>
                  <div className="mt-3 flex justify-end gap-1">
                    <button
                      type="button"
                      aria-label={`Edit ${unit.number}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[#2563eb] hover:bg-[#eff6ff]"
                      onClick={() => {
                        setEditing(unit);
                        setUnitDialog(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${unit.number}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[#be123c] hover:bg-[#fff1f2]"
                      onClick={() => setPendingDelete(unit)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {projectDialog ? (
        <ProjectDialog
          onClose={() => setProjectDialog(false)}
          onCreated={(id) => setProjectId(id)}
        />
      ) : null}
      {unitDialog ? (
        <UnitDialog
          projectId={editing?.projectId ?? selectedProject}
          unit={editing ?? undefined}
          onClose={() => {
            setUnitDialog(false);
            setEditing(null);
          }}
        />
      ) : null}
      {pendingDelete ? (
        <DeleteConfirm
          number={pendingDelete.number}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteUnit(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LinkChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cn("rounded-xl px-2 py-2", tone)}>
      <dt className="font-semibold uppercase tracking-[0.08em] opacity-70">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{value || "—"}</dd>
    </div>
  );
}

function EmptyState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{detail}</p>
      <div className="mt-4">
        <Button onClick={onAction}>{action}</Button>
      </div>
    </div>
  );
}

function DeleteConfirm({
  number,
  onCancel,
  onConfirm,
}: {
  number: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c241f]/45 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-unit-title" className="w-full max-w-sm rounded-[22px] bg-white p-5">
        <h2 id="delete-unit-title" className="text-lg font-semibold">
          Delete {number}?
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This removes the unit and its booking, buyer, and sale notes from the inventory.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Keep unit
          </Button>
          <Button className="bg-[#b42318] hover:bg-[#912018]" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
