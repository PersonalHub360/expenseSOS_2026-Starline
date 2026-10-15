import type { PermissionFlags } from "@/auth/AuthContext";

export const accessModules = [
  ["dashboard", "Dashboard"],
  ["projects", "Projects"],
  ["properties", "Properties"],
  ["buyers", "Buyers"],
  ["sales", "Sales"],
  ["payments", "Payments"],
  ["expenses", "Expenses"],
  ["investments", "Investments"],
  ["accounts", "Cash & bank"],
  ["employees", "Employees"],
  ["vendors", "Vendors"],
  ["reports", "Reports"],
  ["users", "Users"],
  ["settings", "Settings"],
] as const;

export type AccessRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  builtIn: boolean;
  permissions: PermissionFlags[];
};

export function emptyPermissions(): PermissionFlags[] {
  return accessModules.map(([module]) => ({
    module,
    canView: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
  }));
}

export function permissionsFor(role: AccessRole | null) {
  const blank = emptyPermissions();
  if (!role) return blank;
  return blank.map((row) => role.permissions.find((permission) => permission.module === row.module) ?? row);
}

export function permissionSummary(permissions: PermissionFlags[]) {
  const view = permissions.filter((item) => item.canView).length;
  const add = permissions.filter((item) => item.canAdd).length;
  const edit = permissions.filter((item) => item.canEdit).length;
  const remove = permissions.filter((item) => item.canDelete).length;
  return `${view} view · ${add} add · ${edit} edit · ${remove} delete`;
}
