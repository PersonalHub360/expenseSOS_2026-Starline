import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/password";
import type { Principal } from "../auth/principal";
import { db } from "../db/client";
import { rolePermissions, roles, users } from "../db/schema";
import type { PermissionFlags } from "../access";
import { permissionCeilingError } from "./validate";

async function rolePermissionsOf(roleId: string) {
  return db
    .select({
      module: rolePermissions.module,
      canView: rolePermissions.canView,
      canAdd: rolePermissions.canAdd,
      canEdit: rolePermissions.canEdit,
      canDelete: rolePermissions.canDelete,
    })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
}

export async function createWorkspaceUser(
  actor: Principal,
  draft: { username: string; email: string; password: string; roleId: string },
) {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, draft.roleId)).limit(1);
  if (!role) return { ok: false as const, status: 400, error: "Choose a role." };
  const permissions = await rolePermissionsOf(role.id);
  const ceiling = permissionCeilingError(actor.permissions, permissions);
  if (ceiling) return { ok: false as const, status: 403, error: ceiling };
  const passwordHash = await hashPassword(draft.password);
  const [created] = await db
    .insert(users)
    .values({
      username: draft.username,
      email: draft.email,
      passwordHash,
      roleId: role.id,
    })
    .returning({ id: users.id });
  if (!created) return { ok: false as const, status: 500, error: "The user was not saved." };
  return { ok: true as const, id: created.id };
}

export async function createWorkspaceRole(
  actor: Principal,
  draft: { key: string; name: string; description: string; permissions: PermissionFlags[] },
) {
  const ceiling = permissionCeilingError(actor.permissions, draft.permissions);
  if (ceiling) return { ok: false as const, status: 403, error: ceiling };
  const [created] = await db
    .insert(roles)
    .values({ key: draft.key, name: draft.name, description: draft.description })
    .returning({ id: roles.id });
  if (!created) return { ok: false as const, status: 500, error: "The role was not saved." };
  await db.insert(rolePermissions).values(draft.permissions.map((permission) => ({ roleId: created.id, ...permission })));
  return { ok: true as const, id: created.id };
}

export async function updateWorkspaceRole(
  actor: Principal,
  roleId: string,
  draft: { name: string; description: string; permissions: PermissionFlags[] },
) {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return { ok: false as const, status: 404, error: "Role not found." };
  const ceiling = permissionCeilingError(actor.permissions, draft.permissions);
  if (ceiling) return { ok: false as const, status: 403, error: ceiling };
  if (actor.role && (await actorUsesRole(actor.id, role.id))) {
    const usersAccess = draft.permissions.find((permission) => permission.module === "users");
    if (!usersAccess?.canView || !usersAccess.canEdit) {
      return { ok: false as const, status: 400, error: "Keep your own access to manage users." };
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(roles).set({ name: draft.name, description: draft.description }).where(eq(roles.id, role.id));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await tx.insert(rolePermissions).values(draft.permissions.map((permission) => ({ roleId: role.id, ...permission })));
  });
  return { ok: true as const, id: role.id };
}

async function actorUsesRole(userId: string, roleId: string) {
  const [row] = await db.select({ roleId: users.roleId }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.roleId === roleId;
}
