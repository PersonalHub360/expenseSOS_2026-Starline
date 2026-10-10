import type { AuthUser, PermissionFlags } from "@/auth/AuthContext";

export type PermissionAction = "view" | "add" | "edit" | "delete";

export function allows(permission: PermissionFlags | undefined, action: PermissionAction) {
  if (!permission) return false;
  if (action === "view") return permission.canView;
  if (action === "add") return permission.canAdd;
  if (action === "edit") return permission.canEdit;
  return permission.canDelete;
}

export function can(user: AuthUser | null, module: string, action: PermissionAction) {
  return allows(
    user?.permissions.find((permission) => permission.module === module),
    action,
  );
}
