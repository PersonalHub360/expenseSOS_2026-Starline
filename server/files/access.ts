import { eq } from "drizzle-orm";
import { allows, type AppModule, type PermissionAction } from "../access";
import type { Principal } from "../auth/principal";
import { db } from "../db/client";
import { buyers, expenses, investments, projects, sales } from "../db/schema";

export const fileSubjects = ["buyer", "project", "sale", "expense", "investment"] as const;
export type FileSubject = (typeof fileSubjects)[number];

const modules: Record<FileSubject, AppModule> = {
  buyer: "buyers",
  project: "projects",
  sale: "sales",
  expense: "expenses",
  investment: "investments",
};

export function fileModule(subject: string): AppModule | null {
  if (subject in modules) return modules[subject as FileSubject];
  return null;
}

export function canAccessFile(principal: Principal, subject: string, action: PermissionAction) {
  const module = fileModule(subject);
  if (!module) return false;
  return allows(
    principal.permissions.find((permission) => permission.module === module),
    action,
  );
}

export async function subjectExists(subject: FileSubject, id: string) {
  if (subject === "buyer") {
    const [row] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.id, id)).limit(1);
    return Boolean(row);
  }
  if (subject === "project") {
    const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
    return Boolean(row);
  }
  if (subject === "sale") {
    const [row] = await db.select({ id: sales.id }).from(sales).where(eq(sales.id, id)).limit(1);
    return Boolean(row);
  }
  if (subject === "investment") {
    const [row] = await db.select({ id: investments.id }).from(investments).where(eq(investments.id, id)).limit(1);
    return Boolean(row);
  }
  const [row] = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, id)).limit(1);
  return Boolean(row);
}
