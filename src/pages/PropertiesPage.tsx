import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarRange, MapPin, Pencil, Plus, StickyNote } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { addMoney, formatTaka } from "@/lib/money";
import { formatProjectDate, projectStatusLabels, projectStatuses, type ProjectCore, type ProjectStatus } from "@/lib/projects";
import { cn } from "@/lib/utils";

type UnitStatus = "available" | "reserved" | "sold" | "cancelled";
type UnitType = "plot" | "flat" | "unit";

type BoardUnit = {
  id: string;
  number: string;
  type: UnitType;
  size: string;
  sizeUnit: string;
  location: string;
  price: string;
  status: UnitStatus;
  note: string;
  buyerId: string;
  buyerName: string;
  deal: string;
};

type BoardProject = ProjectCore & {
  actualCost: string;
  variance: string;
  investment: string;
  revenue: string;
  damage: string;
  loss: string;
  netProfit: string;
  margin: string | null;
  units: BoardUnit[];
};

const unitStatuses: UnitStatus[] = ["available", "reserved", "sold", "cancelled"];

const statusTone: Record<UnitStatus, { chip: string; bar: string; count: string; active: string }> = {
  available: {
    chip: "bg-[#ccfbf1] text-[#0f766e]",
    bar: "from-[#0f766e] to-[#14b8a6]",
    count: "text-[#0f766e]",
    active: "ring-2 ring-[#0f766e]",
  },
  reserved: {
    chip: "bg-[#fef3c7] text-[#b45309]",
    bar: "from-[#d97706] to-[#fbbf24]",
    count: "text-[#b45309]",
    active: "ring-2 ring-[#d97706]",
  },
  sold: {
    chip: "bg-[#dbeafe] text-[#1d4ed8]",
    bar: "from-[#2563eb] to-[#60a5fa]",
    count: "text-[#1d4ed8]",
    active: "ring-2 ring-[#2563eb]",
  },
  cancelled: {
    chip: "bg-[#ffe4e6] text-[#be123c]",
    bar: "from-[#e11d48] to-[#fb7185]",
    count: "text-[#be123c]",
    active: "ring-2 ring-[#e11d48]",
  },
};

const statusLabels: Record<UnitStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  cancelled: "Cancelled",
};

const projectTone: Record<ProjectStatus, { chip: string; count: string }> = {
  planning: { chip: "bg-[#e0e7ff] text-[#3730a3]", count: "bg-[#eef2ff] text-[#4338ca]" },
  active: { chip: "bg-[#ccfbf1] text-[#0f766e]", count: "bg-[#f0fdfa] text-[#0f766e]" },
  on_hold: { chip: "bg-[#fef3c7] text-[#b45309]", count: "bg-[#fffbeb] text-[#b45309]" },
  completed: { chip: "bg-[#dbeafe] text-[#1d4ed8]", count: "bg-[#eff6ff] text-[#1d4ed8]" },
  cancelled: { chip: "bg-[#ffe4e6] text-[#be123c]", count: "bg-[#fff1f2] text-[#be123c]" },
};

export function PropertiesPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<BoardProject[] | null>(null);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [status, setStatus] = useState<UnitStatus | "all">("all");
  const [type, setType] = useState<UnitType | "all">("all");
  const [query, setQuery] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | "all">("all");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BoardProject | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const allowed = can(user, "properties", "view");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<{ projects: BoardProject[] }>("/api/projects/portfolio").then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setProjects(result.data.projects);
      }
    });
    return () => {
      active = false;
    };
  }, [allowed, reloadKey]);

  const units = useMemo(() => projects?.flatMap((project) => project.units) ?? [], [projects]);

  const visible = useMemo(() => {
    if (!projects) return [];
    const needle = query.trim().toLowerCase();
    return projects
      .filter((project) => projectId === "all" || project.id === projectId)
      .filter((project) => projectStatus === "all" || project.status === projectStatus)
      .map((project) => ({
        ...project,
        units: project.units.filter((unit) => {
          if (status !== "all" && unit.status !== status) return false;
          if (type !== "all" && unit.type !== type) return false;
          if (!needle) return true;
          return [project.name, project.location, project.description, unit.number, unit.location, unit.note, unit.buyerName, unit.deal]
            .join(" ")
            .toLowerCase()
            .includes(needle);
        }),
      }))
      .filter((project) => {
        if (project.units.length > 0) return true;
        if (status !== "all" || type !== "all") return false;
        if (!needle) return true;
        return [project.name, project.location].join(" ").toLowerCase().includes(needle);
      });
  }, [projects, projectId, projectStatus, status, type, query]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to properties.</p>;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#6d28d9] via-[#2563eb] to-[#0f766e] p-5 text-white shadow-[0_16px_40px_rgba(37,99,235,0.22)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Portfolio</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Properties/Units</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/80">
              Each project shows its name, date, location, price, status, and note, then every unit number with its price. Project total price is the sum of the unit prices.
            </p>
          </div>
          {can(user, "projects", "add") ? (
            <Button className="bg-white text-[#5b21b6] hover:bg-[#f5f3ff]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          ) : null}
        </div>
        {projects ? (
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            {projectStatuses.map((item) => {
              const count = projects.filter((project) => project.status === item).length;
              const selected = projectStatus === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setProjectStatus((current) => (current === item ? "all" : item))}
                  className={cn("rounded-full px-3 py-1", selected ? "bg-white text-[#312e81]" : projectTone[item].count)}
                >
                  {projectStatusLabels[item]} · {count}
                </button>
              );
            })}
            <span className="rounded-full bg-white/15 px-3 py-1">{units.length} units</span>
            <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[#065f46]">
              Project total {formatTaka(addMoney(units.map((unit) => unit.price)))}
            </span>
          </div>
        ) : null}
      </header>

      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      {projects === null ? (
        <p className="text-sm text-[#7d8b96]">Loading properties…</p>
      ) : (
      <>
      <div className="grid gap-3 sm:grid-cols-4">
        {unitStatuses.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus((current) => (current === item ? "all" : item))}
            className={cn(
              "rounded-[22px] border border-[#e7eef2] bg-white px-4 py-3 text-left shadow-[0_10px_28px_rgba(22,40,36,0.04)]",
              status === item && statusTone[item].active,
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{statusLabels[item]}</p>
            <p className={cn("mt-1 text-2xl font-semibold", statusTone[item].count)}>
              {units.filter((unit) => unit.status === item).length}
            </p>
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
            {(projects ?? []).map((project) => (
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
            placeholder="Search project, unit, location, or note"
            className="h-11 flex-1 rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm outline-none focus:border-[#2563eb]"
          />
        </div>
      </section>

      {visible.length === 0 ? (
        <section className="rounded-[22px] border border-[#eef1f4] bg-white px-4 py-10 text-center">
          <p className="font-semibold">No properties in this view</p>
          <p className="mt-1 text-sm text-[#7d8b96]">Clear the filters, or add a project and its units.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {visible.map((project) => (
            <ProjectBoard key={project.id} project={project} canEdit={can(user, "projects", "edit")} onEdit={() => setEditing(project)} />
          ))}
        </div>
      )}
      </>
      )}
      {creating ? (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice("Project saved.");
            setReloadKey((current) => current + 1);
          }}
        />
      ) : null}
      {editing ? (
        <ProjectForm
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Project saved.");
            setReloadKey((current) => current + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectBoard({ project, canEdit, onEdit }: { project: BoardProject; canEdit: boolean; onEdit: () => void }) {
  const total = addMoney(project.units.map((unit) => unit.price));
  const dateLabel = project.endDate
    ? `${formatProjectDate(project.startDate)} – ${formatProjectDate(project.endDate)}`
    : formatProjectDate(project.startDate);
  return (
    <article className="overflow-hidden rounded-[28px] border border-[#e7eef2] bg-white shadow-[0_12px_32px_rgba(22,40,36,0.05)]">
      <div className="h-1.5 bg-gradient-to-r from-[#6d28d9] via-[#2563eb] to-[#0f766e]" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/projects/${project.id}`} className="text-xl font-semibold text-[#16302c] hover:text-[#2563eb]">
            {project.name}
          </Link>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", projectTone[project.status].chip)}>
            {projectStatusLabels[project.status]}
          </span>
          {canEdit ? (
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#5b21b6] hover:bg-[#f5f3ff]" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Date" value={dateLabel} />
          <Fact label="Location" value={project.location || "—"} />
          <Fact label="Price" value={formatTaka(project.budget)} />
          <Fact label="Status" value={projectStatusLabels[project.status]} />
        </dl>

        {project.description ? (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-[#f8fafc] px-4 py-3 text-sm text-[#334155]">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden="true" />
            <span>
              <span className="font-semibold text-[#16302c]">Note. </span>
              {project.description}
            </span>
          </p>
        ) : null}

        {project.units.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#f8fafc] px-4 py-6 text-sm text-[#64748b]">No units in this project yet. Add unit numbers from Edit.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e7eef2]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f8fafc] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                <tr>
                  <th className="px-4 py-3">Unit number</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Unit price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {project.units.map((unit) => (
                  <tr key={unit.id} className="border-t border-[#eef2f6]">
                    <td className="px-4 py-3 font-semibold text-[#16302c]">
                      {unit.number}
                      {unit.buyerId ? (
                        <Link href={`/buyers/${unit.buyerId}`} className="mt-0.5 block text-xs font-medium text-[#1d4ed8] hover:underline">
                          {unit.buyerName}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[#5c6b76]">{unit.location || project.location || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-[#047857]">{formatTaka(unit.price)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", statusTone[unit.status].chip)}>
                        {statusLabels[unit.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#5c6b76]">{unit.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#eef2ff] px-4 py-3 text-[#312e81]">
          <p className="text-sm font-semibold">Project total price</p>
          <p className="text-lg font-semibold tabular-nums">{formatTaka(total)}</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Book label="Cost" value={formatTaka(project.actualCost)} />
          <Book label="Revenue" value={formatTaka(project.revenue)} />
          <Book label="Investment" value={formatTaka(project.investment)} />
          <Book label="Damage" value={formatTaka(project.damage)} />
          <Book label="Loss" value={formatTaka(project.loss)} warn={project.loss !== "0.00"} />
          <Book label="Net profit" value={formatTaka(project.netProfit)} warn={project.netProfit.startsWith("-")} />
        </dl>
      </div>
    </article>
  );
}

function Book({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[#f8fafc] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-semibold tabular-nums", warn ? "text-[#be123c]" : "text-[#334155]")}>{value}</dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const icon = label === "Date" ? CalendarRange : label === "Location" ? MapPin : null;
  const Icon = icon;
  return (
    <div className="rounded-2xl border border-[#e7eef2] bg-[#f8fafc] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#16302c]">
        {Icon ? <Icon className="h-3.5 w-3.5 text-[#2563eb]" aria-hidden="true" /> : null}
        <span className="tabular-nums">{value}</span>
      </dd>
    </div>
  );
}
