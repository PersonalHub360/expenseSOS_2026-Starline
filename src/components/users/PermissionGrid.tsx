import type { PermissionFlags } from "@/auth/AuthContext";
import { accessModules } from "@/lib/roles";

const actions = [
  ["canView", "View", "bg-[#0f766e]"],
  ["canAdd", "Add", "bg-[#0369a1]"],
  ["canEdit", "Edit", "bg-[#b45309]"],
  ["canDelete", "Delete", "bg-[#be123c]"],
] as const;

const groups = [
  { title: "Workspace", modules: ["dashboard", "projects", "properties"] },
  { title: "Sales", modules: ["buyers", "sales", "payments"] },
  { title: "Operations", modules: ["expenses", "investments", "accounts", "employees", "vendors"] },
  { title: "Administration", modules: ["reports", "users", "settings"] },
] as const;

const labels = new Map<string, string>(accessModules);

export function PermissionGrid({
  permissions,
  onChange,
  readOnly = false,
}: {
  permissions: PermissionFlags[];
  onChange: (next: PermissionFlags[]) => void;
  readOnly?: boolean;
}) {
  function toggle(module: string, action: (typeof actions)[number][0]) {
    if (readOnly) return;
    onChange(
      permissions.map((row) => {
        if (row.module !== module) return row;
        const next = { ...row, [action]: !row[action] };
        if (action !== "canView" && next[action]) next.canView = true;
        if (action === "canView" && !next.canView) {
          next.canAdd = false;
          next.canEdit = false;
          next.canDelete = false;
        }
        return next;
      }),
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7eeea]">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-[#f7faf8] text-[11px] uppercase tracking-wide text-[#64748b]">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">Module</th>
            {actions.map(([, actionLabel]) => (
              <th key={actionLabel} className="w-20 px-2 py-2.5 text-center font-semibold">
                {actionLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows key={group.title} title={group.title} modules={group.modules} permissions={permissions} readOnly={readOnly} onToggle={toggle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  title,
  modules,
  permissions,
  readOnly,
  onToggle,
}: {
  title: string;
  modules: readonly string[];
  permissions: PermissionFlags[];
  readOnly: boolean;
  onToggle: (module: string, action: (typeof actions)[number][0]) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={5} className="bg-[#f0fdfa] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f766e]">
          {title}
        </td>
      </tr>
      {modules.map((module) => {
        const row = permissions.find((item) => item.module === module);
        const active = Boolean(row?.canView || row?.canAdd || row?.canEdit || row?.canDelete);
        return (
          <tr key={module} className="border-t border-[#eef3f0]">
            <td className={`px-4 py-2.5 font-medium ${active ? "text-[#16332c]" : "text-[#94a3b8]"}`}>{labels.get(module) ?? module}</td>
            {actions.map(([action, actionLabel, tone]) => {
              const on = Boolean(row?.[action]);
              return (
                <td key={action} className="px-2 py-2 text-center">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${labels.get(module) ?? module} ${actionLabel}`}
                    disabled={readOnly}
                    onClick={() => onToggle(module, action)}
                    className={`h-7 min-w-14 rounded-full px-2 text-[11px] font-semibold ${on ? `${tone} text-white` : "bg-white text-[#94a3b8] ring-1 ring-[#e2e8f0]"} disabled:cursor-default`}
                  >
                    {on ? "On" : "Off"}
                  </button>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
