import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CalendarRange, MapPin, Plus, Users } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { formatProjectDate, projectStatuses, projectStatusLabels, type ProjectRecord, type ProjectStatus } from "@/lib/projects";
import { cn } from "@/lib/utils";

const statusTone: Record<ProjectStatus, { chip: string; bar: string; count: string }> = {
  planning: { chip: "bg-[#e0e7ff] text-[#3730a3]", bar: "from-[#6366f1] to-[#818cf8]", count: "bg-[#eef2ff] text-[#4338ca]" },
  active: { chip: "bg-[#ccfbf1] text-[#0f766e]", bar: "from-[#0f766e] to-[#14b8a6]", count: "bg-[#f0fdfa] text-[#0f766e]" },
  on_hold: { chip: "bg-[#fef3c7] text-[#b45309]", bar: "from-[#d97706] to-[#fbbf24]", count: "bg-[#fffbeb] text-[#b45309]" },
  completed: { chip: "bg-[#dbeafe] text-[#1d4ed8]", bar: "from-[#2563eb] to-[#60a5fa]", count: "bg-[#eff6ff] text-[#1d4ed8]" },
  cancelled: { chip: "bg-[#ffe4e6] text-[#be123c]", bar: "from-[#e11d48] to-[#fb7185]", count: "bg-[#fff1f2] text-[#be123c]" },
};

const metricTone = {
  budget: "border-[#c7d2fe] bg-gradient-to-br from-[#eef2ff] to-white text-[#312e81]",
  cost: "border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white text-[#92400e]",
  revenue: "border-[#a7f3d0] bg-gradient-to-br from-[#ecfdf5] to-white text-[#065f46]",
  investment: "border-[#ddd6fe] bg-gradient-to-br from-[#f5f3ff] to-white text-[#5b21b6]",
  damage: "border-[#fecdd3] bg-gradient-to-br from-[#fff1f2] to-white text-[#9f1239]",
  loss: "border-[#fecaca] bg-gradient-to-br from-[#fef2f2] to-white text-[#991b1b]",
  variance: "border-[#bae6fd] bg-gradient-to-br from-[#f0f9ff] to-white text-[#075985]",
  margin: "border-[#99f6e4] bg-gradient-to-br from-[#f0fdfa] to-white text-[#115e59]",
} as const;

export function ProjectsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const allowed = can(user, "projects", "view");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<{ projects: ProjectRecord[] }>("/api/projects").then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else setProjects(result.data.projects);
    });
    return () => {
      active = false;
    };
  }, [allowed]);

  if (!allowed) {
    return <p className="text-sm text-[#b42318]">You do not have access to projects.</p>;
  }

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#0f766e] via-[#0d9488] to-[#2563eb] p-5 text-white shadow-[0_16px_40px_rgba(15,118,110,0.22)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Portfolio</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              Start date, cost, revenue, investment, damage, loss, and net margin from the records.
            </p>
          </div>
          {can(user, "projects", "add") ? (
            <Button className="bg-white text-[#0f766e] hover:bg-[#f0fdfa]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          ) : null}
        </div>
        {projects && projects.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {projectStatuses.map((status) => {
              const count = projects.filter((project) => project.status === status).length;
              return (
                <span key={status} className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusTone[status].count)}>
                  {projectStatusLabels[status]} · {count}
                </span>
              );
            })}
          </div>
        ) : null}
      </header>

      {notice ? (
        <p role="status" className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}

      {projects === null ? (
        <p className="mt-5 text-sm text-[#7d8b96]">Loading projects…</p>
      ) : projects.length === 0 ? (
        <section className="mt-5 rounded-[22px] border border-[#eef1f4] bg-white px-4 py-10 text-center">
          <p className="font-semibold">No projects yet</p>
          <p className="mt-1 text-sm text-[#7d8b96]">Create a project to track its budget, cost, and result.</p>
        </section>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => {
            const tone = statusTone[project.status];
            const loss = project.netProfit.startsWith("-");
            return (
              <article key={project.id} className="overflow-hidden rounded-[28px] border border-[#e7eef2] bg-white shadow-[0_12px_32px_rgba(22,40,36,0.05)]">
                <div className={`h-1.5 bg-gradient-to-r ${tone.bar}`} />
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/projects/${project.id}`} className="text-xl font-semibold text-[#16302c] hover:text-[#0f766e]">
                          {project.name}
                        </Link>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", tone.chip)}>
                          {projectStatusLabels[project.status]}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#5c6b76]">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-[#0f766e]" aria-hidden="true" />
                          {project.location}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarRange className="h-3.5 w-3.5 text-[#2563eb]" aria-hidden="true" />
                          {formatProjectDate(project.startDate)} – {formatProjectDate(project.endDate)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-[#7c3aed]" aria-hidden="true" />
                          {project.staff.length ? project.staff.map((person) => person.name).join(", ") : "No staff assigned"}
                        </span>
                      </div>
                    </div>
                    <div className={cn("rounded-2xl px-4 py-3", loss ? "bg-[#fff1f2] text-[#be123c]" : "bg-[#ecfdf5] text-[#047857]")}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">Net profit</p>
                      <p className="text-lg font-semibold tabular-nums">{formatTaka(project.netProfit)}</p>
                      <p className="text-xs font-medium opacity-80">Margin {project.margin ?? "—"}</p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                    <Metric tone="budget" label="Budget" value={formatTaka(project.budget)} />
                    <Metric tone="cost" label="Cost" value={formatTaka(project.actualCost)} />
                    <Metric tone="revenue" label="Revenue" value={formatTaka(project.revenue)} />
                    <Metric tone="investment" label="Investment" value={formatTaka(project.investment)} />
                    <Metric tone="damage" label="Damage" value={formatTaka(project.damage)} />
                    <Metric tone="loss" label="Loss" value={formatTaka(project.loss)} warn={project.loss !== "0.00"} />
                    <Metric tone="variance" label="Variance" value={formatTaka(project.variance)} warn={project.variance.startsWith("-")} />
                    <Metric tone="margin" label="Net margin" value={project.margin ?? "—"} warn={project.margin?.startsWith("-")} />
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {creating ? (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setNotice("Project saved.");
            navigate(`/projects/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function Metric({
  tone,
  label,
  value,
  warn = false,
}: {
  tone: keyof typeof metricTone;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border px-3 py-2", metricTone[tone])}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</dt>
      <dd className={cn("mt-1 text-sm font-semibold tabular-nums", warn && "text-[#be123c]")}>{value}</dd>
    </div>
  );
}
