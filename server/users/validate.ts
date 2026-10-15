import { z } from "zod";
import { modules, type PermissionFlags } from "../access";

const permissionSchema = z.object({
  module: z.enum(modules),
  canView: z.boolean(),
  canAdd: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

export function roleKeyFromName(name: string) {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) return null;
  return key;
}

export function normalizePermissions(rows: PermissionFlags[]) {
  const byModule = new Map<string, PermissionFlags>();
  for (const row of rows) byModule.set(row.module, row);
  return modules.map((module) => {
    const row = byModule.get(module);
    const canAdd = row?.canAdd ?? false;
    const canEdit = row?.canEdit ?? false;
    const canDelete = row?.canDelete ?? false;
    const canView = Boolean(row?.canView || canAdd || canEdit || canDelete);
    return { module, canView, canAdd: canView && canAdd, canEdit: canView && canEdit, canDelete: canView && canDelete };
  });
}

export function permissionCeilingError(actor: PermissionFlags[], requested: PermissionFlags[]) {
  for (const item of requested) {
    const own = actor.find((permission) => permission.module === item.module);
    const blocked =
      (item.canView && !own?.canView) ||
      (item.canAdd && !own?.canAdd) ||
      (item.canEdit && !own?.canEdit) ||
      (item.canDelete && !own?.canDelete);
    if (blocked) return "You can only grant permissions you already have.";
  }
  return null;
}

const permissionList = z.array(permissionSchema).max(modules.length);

export function parseNewUser(body: unknown) {
  const parsed = z
    .object({
      username: z
        .string()
        .trim()
        .min(3, "Enter a username with at least 3 characters.")
        .max(40)
        .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, or dashes in the username."),
      email: z.string().trim().email("Enter a valid email address.").max(160),
      password: z.string().min(12, "Use a password with at least 12 characters.").max(200),
      roleId: z.string().uuid("Choose a role."),
    })
    .safeParse(body);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the user." };
  return { ok: true as const, value: { ...parsed.data, email: parsed.data.email.toLowerCase() } };
}

export function parseNewRole(body: unknown) {
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Enter a role name.").max(60),
      description: z.string().trim().max(200).optional().default(""),
      permissions: permissionList,
    })
    .safeParse(body);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the role." };
  const key = roleKeyFromName(parsed.data.name);
  if (!key) return { ok: false as const, error: "Use a role name with letters." };
  return {
    ok: true as const,
    value: { ...parsed.data, key, permissions: normalizePermissions(parsed.data.permissions) },
  };
}

export function parseRoleUpdate(body: unknown) {
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Enter a role name.").max(60),
      description: z.string().trim().max(200).optional().default(""),
      permissions: permissionList,
    })
    .safeParse(body);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the permissions." };
  return {
    ok: true as const,
    value: { ...parsed.data, permissions: normalizePermissions(parsed.data.permissions) },
  };
}
