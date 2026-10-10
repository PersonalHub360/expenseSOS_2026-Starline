import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "./auth/password";
import { db, pool } from "./db/client";
import { seedAccessCatalog } from "./db/catalog";
import { roles, users } from "./db/schema";

const bootstrap = z
  .object({
    BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
    BOOTSTRAP_ADMIN_USERNAME: z.string().min(3),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12),
  })
  .safeParse(process.env);

if (!bootstrap.success) {
  console.error("Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_USERNAME, and BOOTSTRAP_ADMIN_PASSWORD.");
  process.exit(1);
}

await seedAccessCatalog();

const [existing] = await db.select({ total: count() }).from(users);
if ((existing?.total ?? 0) > 0) {
  console.error("Bootstrap skipped because a user account already exists.");
  await pool.end();
  process.exit(1);
}

const [role] = await db.select().from(roles).where(eq(roles.key, "super_admin")).limit(1);
if (!role) throw new Error("Super Admin role is missing.");

await db.insert(users).values({
  email: bootstrap.data.BOOTSTRAP_ADMIN_EMAIL,
  username: bootstrap.data.BOOTSTRAP_ADMIN_USERNAME,
  passwordHash: await hashPassword(bootstrap.data.BOOTSTRAP_ADMIN_PASSWORD),
  roleId: role.id,
});

await pool.end();
console.log("First administrator created. Demo projects were not added.");