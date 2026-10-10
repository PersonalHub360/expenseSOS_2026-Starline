import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { allows, type AppModule, type PermissionAction, type PermissionFlags } from "../access";
import { db } from "../db/client";
import { rolePermissions, roles, users } from "../db/schema";

export type Principal = {
  id: string;
  email: string;
  username: string;
  role: string;
  permissions: PermissionFlags[];
};

export async function findPrincipal(userId: string): Promise<Principal | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      isActive: users.isActive,
      role: roles.key,
      roleId: users.roleId,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) return null;

  const permissions = await db
    .select({
      module: rolePermissions.module,
      canView: rolePermissions.canView,
      canAdd: rolePermissions.canAdd,
      canEdit: rolePermissions.canEdit,
      canDelete: rolePermissions.canDelete,
    })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, user.roleId));

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    permissions,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const principal = await findPrincipal(userId);
  if (!principal) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  res.locals.principal = principal;
  next();
}

export function requirePermission(module: AppModule, action: PermissionAction) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const principal = res.locals.principal as Principal | undefined;
    if (!principal) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const permission = principal.permissions.find((item) => item.module === module);
    if (!allows(permission, action)) {
      res.status(403).json({ error: "You do not have access to this action" });
      return;
    }
    next();
  };
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}
