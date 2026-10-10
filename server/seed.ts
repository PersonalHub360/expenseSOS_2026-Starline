import { eq } from "drizzle-orm";
import { env } from "./env";
import { hashPassword } from "./auth/password";
import { db, pool } from "./db/client";
import { seedAccessCatalog } from "./db/catalog";
import { projects, roles, users } from "./db/schema";
import { refuseProductionDemo } from "./seed-guard";

try {
  refuseProductionDemo(env.NODE_ENV);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Refusing to load demo data in production.");
  process.exit(1);
}

const email = env.DEMO_ADMIN_EMAIL;
const username = env.DEMO_ADMIN_USERNAME;
const password = env.DEMO_ADMIN_PASSWORD;

if (!email || !username || !password) {
  console.error("Set DEMO_ADMIN_EMAIL, DEMO_ADMIN_USERNAME, and DEMO_ADMIN_PASSWORD before seeding.");
  process.exit(1);
}

await seedAccessCatalog();

const [role] = await db.select().from(roles).where(eq(roles.key, "super_admin")).limit(1);
if (!role) throw new Error("Super Admin role is missing after the access catalog seed.");

const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
if (!existing) {
  await db.insert(users).values({
    email,
    username,
    passwordHash: await hashPassword(password),
    roleId: role.id,
  });
}

const projectName = "Abashik (Anarkoli)";
const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, projectName)).limit(1);
if (!project) {
  await db.insert(projects).values({
    name: projectName,
    location: "Anarkoli",
    description: "Residential project at Anarkoli.",
    status: "planning",
    budget: "0.00",
  });
}

await pool.end();
console.log("Development seed complete. No demo records were written for production.");
