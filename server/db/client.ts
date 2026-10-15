import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

let poolRef: pg.Pool | undefined;
let dbRef: Database | undefined;

function getPool() {
  poolRef ??= new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: process.env.VERCEL ? 1 : 10,
  });
  return poolRef;
}

function getDb() {
  dbRef ??= drizzle(getPool(), { schema });
  return dbRef;
}

function bindMember<T extends object>(target: T, property: PropertyKey, receiver: unknown) {
  const value = Reflect.get(target, property, receiver);
  return typeof value === "function" ? value.bind(target) : value;
}

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, property, receiver) {
    return bindMember(getPool(), property, receiver);
  },
});

export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return bindMember(getDb(), property, receiver);
  },
});
