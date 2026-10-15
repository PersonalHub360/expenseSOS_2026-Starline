import { eq } from "drizzle-orm";
import { roleCatalog } from "../access";
import { db } from "./client";
import { rolePermissions, roles } from "./schema";

/** Reference data required for authorization. This is not demo content. */
export async function seedAccessCatalog() {
  for (const role of roleCatalog) {
    const existing = await db.select().from(roles).where(eq(roles.key, role.key)).limit(1);
    const roleId =
      existing[0]?.id ??
      (
        await db
          .insert(roles)
          .values({ key: role.key, name: role.name, description: role.description })
          .returning({ id: roles.id })
      )[0]?.id;

    if (!roleId) throw new Error(`Could not store role ${role.key}`);

    const stored = await db
      .select({ module: rolePermissions.module })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    const present = new Set(stored.map((row) => row.module));
    const missing = role.permissions.filter((permission) => !present.has(permission.module));
    if (missing.length === 0) continue;
    await db.insert(rolePermissions).values(
      missing.map((permission) => ({
        roleId,
        module: permission.module,
        canView: permission.canView,
        canAdd: permission.canAdd,
        canEdit: permission.canEdit,
        canDelete: permission.canDelete,
      })),
    );
  }
}
