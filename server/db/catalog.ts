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

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    await db.insert(rolePermissions).values(
      role.permissions.map((permission) => ({
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
