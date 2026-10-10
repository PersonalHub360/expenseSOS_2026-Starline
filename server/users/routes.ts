import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth/principal";
import { db } from "../db/client";
import { roles, users } from "../db/schema";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", requirePermission("users", "view"), async (_req, res) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      isActive: users.isActive,
      createdAt: users.createdAt,
      role: roles.name,
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
      createdAt: row.createdAt.toISOString(),
    })),
  });
});
