import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { writeAudit } from "../audit/log";
import { roleCatalog } from "../access";
import type { Principal } from "../auth/principal";
import { requireAuth, requirePermission } from "../auth/principal";
import { db } from "../db/client";
import { rolePermissions, roles, users } from "../db/schema";
import { createWorkspaceRole, createWorkspaceUser, updateWorkspaceRole } from "./commands";
import { parseNewRole, parseNewUser, parseRoleUpdate } from "./validate";

const builtInKeys = new Set<string>(roleCatalog.map((role) => role.key));

export const usersRouter = Router();

usersRouter.use(requireAuth);

function actor(res: { locals: { principal?: Principal } }) {
  return res.locals.principal as Principal;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

usersRouter.get("/roles", requirePermission("users", "view"), async (_req, res) => {
  const roleRows = await db.select().from(roles).orderBy(asc(roles.name));
  const permissionRows = await db.select().from(rolePermissions);
  res.json({
    roles: roleRows.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      builtIn: builtInKeys.has(role.key),
      permissions: permissionRows
        .filter((permission) => permission.roleId === role.id)
        .map((permission) => ({
          module: permission.module,
          canView: permission.canView,
          canAdd: permission.canAdd,
          canEdit: permission.canEdit,
          canDelete: permission.canDelete,
        })),
    })),
  });
});

usersRouter.post("/roles", requirePermission("users", "edit"), async (req, res) => {
  const parsed = parseNewRole(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const created = await createWorkspaceRole(actor(res), parsed.value);
    if (!created.ok) {
      res.status(created.status).json({ error: created.error });
      return;
    }
    await writeAudit({
      actorId: actor(res).id,
      action: "create",
      subjectType: "role",
      subjectId: created.id,
      summary: "Role created",
    });
    res.status(201).json({ id: created.id });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "This role already exists." });
      return;
    }
    throw error;
  }
});

usersRouter.patch("/roles/:id", requirePermission("users", "edit"), async (req, res) => {
  const parsed = parseRoleUpdate(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const roleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!roleId) {
    res.status(404).json({ error: "Role not found." });
    return;
  }
  const updated = await updateWorkspaceRole(actor(res), roleId, parsed.value);
  if (!updated.ok) {
    res.status(updated.status).json({ error: updated.error });
    return;
  }
  await writeAudit({
    actorId: actor(res).id,
    action: "update",
    subjectType: "role",
    subjectId: updated.id,
    summary: "Role permissions updated",
  });
  res.json({ id: updated.id });
});

usersRouter.get("/", requirePermission("users", "view"), async (_req, res) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      isActive: users.isActive,
      createdAt: users.createdAt,
      role: roles.name,
      roleId: roles.id,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .orderBy(asc(users.username));
  res.json({
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      username: row.username,
      isActive: row.isActive,
      role: row.role,
      roleId: row.roleId,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

usersRouter.post("/", requirePermission("users", "add"), async (req, res) => {
  const parsed = parseNewUser(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const created = await createWorkspaceUser(actor(res), parsed.value);
    if (!created.ok) {
      res.status(created.status).json({ error: created.error });
      return;
    }
    await writeAudit({
      actorId: actor(res).id,
      action: "create",
      subjectType: "user",
      subjectId: created.id,
      summary: "User created",
    });
    res.status(201).json({ id: created.id });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "This email or username is already in use." });
      return;
    }
    throw error;
  }
});
