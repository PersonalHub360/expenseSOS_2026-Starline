import { migrate } from "drizzle-orm/node-postgres/migrator";
import { seedAccessCatalog } from "./catalog";
import { pool, db } from "./client";

await migrate(db, { migrationsFolder: "drizzle" });
await seedAccessCatalog();
await pool.end();
console.log("Migrations applied. Role catalog is in place; no demo records were added.");
