import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTimestamp } from "@/lib/sales";

type WorkspaceUser = {
  id: string;
  email: string;
  username: string;
  isActive: boolean;
  role: string;
  createdAt: string;
};

export function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WorkspaceUser[] | null>(null);
  const [error, setError] = useState("");
  const allowed = can(user, "users", "view");

  useEffect(() => {
    if (!allowed) return;
    api<{ users: WorkspaceUser[] }>("/api/users").then((result) => {
      if (!result.ok) setError(result.error);
      else setRows(result.data.users);
    });
  }, [allowed]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to users.</p>;

  const active = (rows ?? []).filter((item) => item.isActive).length;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#0f172a] via-[#1e3a8a] to-[#7c3aed] p-5 text-white shadow-[0_16px_40px_rgba(30,58,138,0.22)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 max-w-xl text-sm text-white/80">Workspace accounts, sign-in names, and roles. Passwords are never shown.</p>
        {rows ? (
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/15 px-3 py-1">{rows.length} accounts</span>
            <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[#065f46]">{active} active</span>
            <span className="rounded-full bg-[#ffe4e6] px-3 py-1 text-[#9f1239]">{rows.length - active} inactive</span>
          </div>
        ) : null}
      </header>
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {rows === null ? (
        <p className="text-sm text-[#7d8b96]">Loading users…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[22px] bg-white px-4 py-10 text-center text-sm text-[#7d8b96]">No accounts yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((account) => (
            <article key={account.id} className="rounded-[22px] border border-[#c7d2fe] bg-white p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[#1e3a8a]">{account.username}</p>
                  <p className="mt-1 text-sm text-[#475569]">{account.email}</p>
                </div>
                <span className={account.isActive ? "rounded-full bg-[#d1fae5] px-2.5 py-1 text-[11px] font-semibold text-[#047857]" : "rounded-full bg-[#ffe4e6] px-2.5 py-1 text-[11px] font-semibold text-[#be123c]"}>
                  {account.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-[#6d28d9]">{account.role}</p>
              <p className="mt-1 text-xs text-[#94a3b8]">Joined {formatTimestamp(account.createdAt)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
