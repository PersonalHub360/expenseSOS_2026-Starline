import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, Shield, UserRound } from "lucide-react";
import type { PermissionFlags } from "@/auth/AuthContext";
import { useAuth } from "@/auth/AuthContext";
import { PermissionGrid } from "@/components/users/PermissionGrid";
import { RoleForm } from "@/components/users/RoleForm";
import { UserForm } from "@/components/users/UserForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { permissionSummary, permissionsFor, type AccessRole } from "@/lib/roles";
import { formatTimestamp } from "@/lib/sales";

type WorkspaceUser = {
  id: string;
  email: string;
  username: string;
  isActive: boolean;
  role: string;
  roleId: string;
  createdAt: string;
};

export function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WorkspaceUser[] | null>(null);
  const [roles, setRoles] = useState<AccessRole[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [edits, setEdits] = useState<Record<string, PermissionFlags[]>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [saving, setSaving] = useState(false);
  const allowed = can(user, "users", "view");
  const canAdd = can(user, "users", "add");
  const canEdit = can(user, "users", "edit");

  const load = useCallback(() => {
    if (!allowed) return;
    api<{ users: WorkspaceUser[] }>("/api/users").then((result) => {
      if (!result.ok) setError(result.error);
      else setRows(result.data.users);
    });
    api<{ roles: AccessRole[] }>("/api/users/roles").then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setRoles(result.data.roles);
        setSelectedId((current) => current || result.data.roles[0]?.id || "");
      }
    });
  }, [allowed]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = roles?.find((role) => role.id === selectedId) ?? null;
  const savedPermissions = useMemo(() => permissionsFor(selected), [selected]);
  const draft = (selected && edits[selected.id]) || savedPermissions;
  const dirty = Boolean(selected && edits[selected.id] && JSON.stringify(edits[selected.id]) !== JSON.stringify(savedPermissions));

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to users.</p>;

  const active = (rows ?? []).filter((item) => item.isActive).length;

  function chooseRole(id: string) {
    setSelectedId(id);
  }

  function updateDraft(next: PermissionFlags[]) {
    if (!selected) return;
    setEdits((current) => ({ ...current, [selected.id]: next }));
  }

  function undoDraft() {
    if (!selected) return;
    setEdits((current) => {
      const next = { ...current };
      delete next[selected.id];
      return next;
    });
  }

  async function savePermissions() {
    if (!selected || !dirty) return;
    setSaving(true);
    setError("");
    const result = await api(`/api/users/roles/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: selected.name, description: selected.description, permissions: draft }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRoles((current) => current?.map((role) => (role.id === selected.id ? { ...role, permissions: draft } : role)) ?? current);
    undoDraft();
    setNotice("Permissions saved.");
    load();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-[24px] border border-[#e7eeea] bg-white px-5 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#16332c]">Users</h1>
          <p className="mt-1 max-w-xl text-sm text-[#5c6b76]">Accounts stay in one list. Pick a role, then set its permissions beside it.</p>
        </div>
        {canAdd ? (
          <Button onClick={() => setAddingUser(true)}>
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={UserRound} label="Accounts" value={rows ? String(rows.length) : "—"} />
        <Stat icon={Shield} label="Active" value={rows ? String(active) : "—"} />
        <Stat icon={KeyRound} label="Roles" value={roles ? String(roles.length) : "—"} />
      </div>

      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-[#ecfdf3] px-3 py-2 text-sm text-[#027a48]">{notice}</p> : null}

      <section className="overflow-hidden rounded-[24px] border border-[#e7eeea] bg-white">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0fdfa] text-[#0f766e]">
            <UserRound className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[#16332c]">Accounts</h2>
            <p className="text-xs text-[#64748b]">People who can sign in. Click a role to open its permissions.</p>
          </div>
        </div>
        {rows === null ? (
          <p className="px-5 pb-5 text-sm text-[#7d8b96]">Loading users…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 pb-8 text-center text-sm text-[#7d8b96]">No accounts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-[#f7faf8] text-[11px] uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-5 py-2 font-semibold">Username</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-5 py-2 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => (
                  <tr key={account.id} className="border-t border-[#eef3f0]">
                    <td className="px-5 py-3 font-semibold text-[#16332c]">{account.username}</td>
                    <td className="px-3 py-3 text-[#475569]">{account.email}</td>
                    <td className="px-3 py-3">
                      <button type="button" className="font-medium text-[#0f766e] underline-offset-2 hover:underline" onClick={() => chooseRole(account.roleId)}>
                        {account.role}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <span className={account.isActive ? "rounded-full bg-[#d1fae5] px-2.5 py-1 text-[11px] font-semibold text-[#047857]" : "rounded-full bg-[#ffe4e6] px-2.5 py-1 text-[11px] font-semibold text-[#be123c]"}>
                        {account.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#94a3b8]">{formatTimestamp(account.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section className="min-w-0 rounded-[24px] border border-[#e7eeea] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0fdfa] text-[#0f766e]">
                <Shield className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-[#16332c]">Roles</h2>
                <p className="text-xs text-[#64748b]">Select one</p>
              </div>
            </div>
            {canEdit ? (
              <Button variant="secondary" size="sm" onClick={() => setCreatingRole(true)}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            ) : null}
          </div>
          {roles === null ? (
            <p className="mt-4 text-sm text-[#7d8b96]">Loading roles…</p>
          ) : (
            <div className="mt-4 space-y-2">
              {roles.map((role) => {
                const count = (rows ?? []).filter((account) => account.roleId === role.id).length;
                const chosen = role.id === selectedId;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => chooseRole(role.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left ${chosen ? "border-[#0f766e] bg-[#f0fdfa] shadow-[inset_3px_0_0_#0f766e]" : "border-[#e7eeea] bg-[#fbfcfb] hover:border-[#99d5cf]"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#16332c]">{role.name}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#64748b] ring-1 ring-[#e7eeea]">
                        {count}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#64748b]">{role.description || "No description yet."}</span>
                    <span className="mt-1 block text-[11px] font-medium text-[#0f766e]">{permissionSummary(role.permissions)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section id="role-permissions" className="min-w-0 rounded-[24px] border border-[#e7eeea] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0fdfa] text-[#0f766e]">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-[#16332c]">Permissions</h2>
                <p className="text-xs text-[#64748b]">{selected ? selected.name : "Choose a role"}</p>
              </div>
            </div>
            {selected && canEdit ? (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={undoDraft} disabled={!dirty || saving}>
                  Undo
                </Button>
                <Button size="sm" onClick={savePermissions} disabled={!dirty || saving}>
                  {saving ? "Saving…" : "Save permissions"}
                </Button>
              </div>
            ) : null}
          </div>

          {selected ? (
            <>
              <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${dirty ? "bg-[#fff7ed] text-[#9a3412]" : "bg-[#f7faf8] text-[#5c6b76]"}`}>
                {dirty ? "Not saved yet. Press save to keep this permission change." : "These permissions are saved for this role."}
              </p>
              <p className="mt-3 text-xs text-[#64748b]">View is teal, Add is blue, Edit is amber, and Delete is red. Turning Add, Edit, or Delete on also turns View on.</p>
              <div className="mt-3 overflow-x-auto">
                <PermissionGrid permissions={draft} onChange={updateDraft} readOnly={!canEdit} />
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-[#7d8b96]">Choose a role to see its permissions.</p>
          )}
        </section>
      </div>

      {addingUser && roles ? (
        <UserForm
          roles={roles}
          onClose={() => setAddingUser(false)}
          onSaved={(message) => {
            setAddingUser(false);
            setNotice(message);
            setError("");
            load();
          }}
        />
      ) : null}
      {creatingRole ? (
        <RoleForm
          onClose={() => setCreatingRole(false)}
          onSaved={(id) => {
            setCreatingRole(false);
            setSelectedId(id);
            setNotice("Role created. Set its permissions on the right.");
            setError("");
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#e7eeea] bg-white px-4 py-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0fdfa] text-[#0f766e]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">{label}</p>
        <p className="text-2xl font-semibold leading-none text-[#16332c]">{value}</p>
      </div>
    </div>
  );
}
