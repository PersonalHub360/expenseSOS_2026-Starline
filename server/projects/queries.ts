import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { countsTowardCost } from "../expenses/policy";
import { db } from "../db/client";
import {
  bookings,
  buyers,
  documents,
  employees,
  expenses,
  investments,
  payments,
  projectStaff,
  projects,
  sales,
  units,
} from "../db/schema";
import { addMoney, compareMoney, subtractMoney } from "./money";
import { projectResult } from "./performance";

const zero = "0.00";

export async function listProjects() {
  const rows = await db.select().from(projects).orderBy(projects.name);
  const staff = await staffByProject(rows.map((row) => row.id));
  const [expenseRows, saleRows, investmentRows] = await Promise.all([
    db
      .select({
        projectId: expenses.projectId,
        amount: expenses.amount,
        status: expenses.status,
        category: expenses.category,
      })
      .from(expenses),
    db
      .select({ projectId: units.projectId, amount: sales.amount, status: sales.status })
      .from(sales)
      .innerJoin(units, eq(sales.unitId, units.id)),
    db.select({ projectId: investments.projectId, amount: investments.amount }).from(investments),
  ]);

  return rows.map((project) => {
    const projectExpenses = expenseRows.filter((row) => row.projectId === project.id);
    const actualCost = addMoney(
      projectExpenses.filter((row) => countsTowardCost(row.status)).map((row) => row.amount),
    );
    const result = projectResult({
      cost: actualCost,
      sales: saleRows.filter((row) => row.projectId === project.id),
      expenses: projectExpenses,
    });
    return {
      ...presentProject(project),
      actualCost,
      variance: subtractMoney(project.budget, actualCost),
      investment: addMoney(investmentRows.filter((row) => row.projectId === project.id).map((row) => row.amount)),
      ...result,
      staff: staff.get(project.id) ?? [],
    };
  });
}

export async function listPropertyBoard() {
  const projectRows = await listProjects();
  const unitRows = await db
    .select({
      id: units.id,
      projectId: units.projectId,
      number: units.number,
      type: units.type,
      size: units.size,
      sizeUnit: units.sizeUnit,
      location: units.location,
      price: units.price,
      status: units.status,
      note: units.note,
    })
    .from(units)
    .orderBy(asc(units.number));
  const unitIds = unitRows.map((unit) => unit.id);
  const saleRows = unitIds.length
    ? await db
        .select({
          unitId: sales.unitId,
          reference: sales.reference,
          buyerId: buyers.id,
          buyerName: buyers.name,
        })
        .from(sales)
        .innerJoin(buyers, eq(sales.buyerId, buyers.id))
        .where(and(inArray(sales.unitId, unitIds), ne(sales.status, "cancelled")))
    : [];
  const bookingRows = unitIds.length
    ? await db
        .select({
          unitId: bookings.unitId,
          reference: bookings.reference,
          buyerId: buyers.id,
          buyerName: buyers.name,
        })
        .from(bookings)
        .innerJoin(buyers, eq(bookings.buyerId, buyers.id))
        .where(and(inArray(bookings.unitId, unitIds), eq(bookings.status, "open")))
    : [];

  return projectRows.map((project) => ({
    ...project,
    units: unitRows
      .filter((unit) => unit.projectId === project.id)
      .map((unit) => {
        const sale = saleRows.find((row) => row.unitId === unit.id);
        const booking = bookingRows.find((row) => row.unitId === unit.id);
        const holder = sale ?? booking;
        return {
          id: unit.id,
          number: unit.number,
          type: unit.type,
          size: unit.size,
          sizeUnit: unit.sizeUnit,
          location: unit.location,
          price: unit.price,
          status: unit.status,
          note: unit.note,
          buyerId: holder?.buyerId ?? "",
          buyerName: holder?.buyerName ?? "",
          deal: holder?.reference ?? "",
        };
      }),
  }));
}

export async function projectDetail(id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return null;

  const staff = (await staffByProject([id])).get(id) ?? [];
  const unitRows = await db
    .select({
      id: units.id,
      number: units.number,
      type: units.type,
      status: units.status,
      price: units.price,
      location: units.location,
      note: units.note,
    })
    .from(units)
    .where(eq(units.projectId, id))
    .orderBy(units.number);

  const unitIds = unitRows.map((unit) => unit.id);
  const saleRows = unitIds.length
    ? await db
        .select({
          id: sales.id,
          reference: sales.reference,
          amount: sales.amount,
          status: sales.status,
          buyerName: buyers.name,
          unitNumber: units.number,
        })
        .from(sales)
        .innerJoin(units, eq(sales.unitId, units.id))
        .innerJoin(buyers, eq(sales.buyerId, buyers.id))
        .where(inArray(sales.unitId, unitIds))
    : [];

  const saleIds = saleRows.map((sale) => sale.id);
  const paymentRows = saleIds.length
    ? await db
        .select({
          id: payments.id,
          amount: payments.amount,
          method: payments.method,
          note: payments.note,
          paidAt: payments.paidAt,
          saleId: payments.saleId,
        })
        .from(payments)
        .where(inArray(payments.saleId, saleIds))
    : [];

  const expenseRows = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      category: expenses.category,
      note: expenses.note,
      status: expenses.status,
      spentAt: expenses.spentAt,
    })
    .from(expenses)
    .where(eq(expenses.projectId, id));

  const investmentRows = await db
    .select({
      id: investments.id,
      investorName: investments.investorName,
      amount: investments.amount,
      note: investments.note,
      investedAt: investments.investedAt,
    })
    .from(investments)
    .where(eq(investments.projectId, id));

  const documentRows = await db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
      note: documents.note,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.projectId, id));

  const actualCost = addMoney(expenseRows.filter((row) => countsTowardCost(row.status)).map((row) => row.amount));
  const invested = addMoney(investmentRows.map((row) => row.amount));
  const collected = addMoney(paymentRows.map((row) => row.amount));
  const result = projectResult({ cost: actualCost, sales: saleRows, expenses: expenseRows });

  return {
    project: { ...presentProject(project), staff },
    summary: {
      budget: project.budget,
      actualCost,
      variance: subtractMoney(project.budget, actualCost),
      invested,
      collected,
      ...result,
      counts: {
        units: unitRows.length,
        sales: saleRows.length,
        payments: paymentRows.length,
        expenses: expenseRows.length,
        investments: investmentRows.length,
        documents: documentRows.length,
      },
    },
    units: unitRows,
    sales: saleRows,
    payments: paymentRows,
    expenses: expenseRows,
    investments: investmentRows,
    documents: documentRows,
  };
}

export async function syncProjectUnits(
  projectId: string,
  drafts: {
    id: string;
    number: string;
    location: string;
    price: string;
    status: "available" | "reserved" | "sold" | "cancelled";
    note: string;
    size: string;
    sizeUnit: string;
  }[],
) {
  const existing = await db.select({ id: units.id, number: units.number }).from(units).where(eq(units.projectId, projectId));
  const kept = new Set(drafts.map((row) => row.id).filter(Boolean));
  for (const unit of existing) {
    if (kept.has(unit.id)) continue;
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.unitId, unit.id)).limit(1);
    const [sale] = await db.select({ id: sales.id }).from(sales).where(eq(sales.unitId, unit.id)).limit(1);
    if (booking || sale) {
      return { ok: false as const, error: `Unit ${unit.number} has a booking or sale and cannot be removed.` };
    }
    await db.delete(units).where(eq(units.id, unit.id));
  }

  for (const row of drafts) {
    const location = row.location.trim();
    if (row.id) {
      if (!existing.some((unit) => unit.id === row.id)) {
        return { ok: false as const, error: "That unit is no longer on this project." };
      }
      if (compareMoney(row.price, "0.00") <= 0) {
        return { ok: false as const, error: "Enter a unit price greater than zero." };
      }
      await db
        .update(units)
        .set({
          number: row.number,
          location,
          price: row.price,
          status: row.status,
          note: row.note,
          updatedAt: new Date(),
        })
        .where(and(eq(units.id, row.id), eq(units.projectId, projectId)));
    } else {
      await db.insert(units).values({
        projectId,
        number: row.number,
        type: "flat",
        size: row.size,
        sizeUnit: row.sizeUnit,
        location,
        price: row.price,
        status: row.status,
        note: row.note,
      });
    }
  }
  return { ok: true as const };
}

export async function replaceStaff(projectId: string, staffIds: string[], newcomers: { name: string; jobTitle: string }[]) {
  if (staffIds.length) {
    const existing = await db.select({ id: employees.id }).from(employees).where(inArray(employees.id, staffIds));
    if (existing.length !== staffIds.length) {
      return { ok: false as const, error: "Choose responsible staff from the directory." };
    }
  }

  const created = newcomers.length
    ? await db
        .insert(employees)
        .values(
          newcomers.map((person) => ({
            name: person.name,
            jobTitle: person.jobTitle,
            monthlySalary: zero,
          })),
        )
        .returning({ id: employees.id })
    : [];

  const ids = [...staffIds, ...created.map((person) => person.id)];
  await db.delete(projectStaff).where(eq(projectStaff.projectId, projectId));
  if (ids.length) {
    await db.insert(projectStaff).values(ids.map((employeeId) => ({ projectId, employeeId })));
  }
  return { ok: true as const };
}

async function staffByProject(projectIds: string[]) {
  const grouped = new Map<string, { id: string; name: string; jobTitle: string }[]>();
  if (!projectIds.length) return grouped;
  const rows = await db
    .select({
      projectId: projectStaff.projectId,
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
    })
    .from(projectStaff)
    .innerJoin(employees, eq(projectStaff.employeeId, employees.id))
    .where(inArray(projectStaff.projectId, projectIds));

  for (const row of rows) {
    const list = grouped.get(row.projectId) ?? [];
    list.push({ id: row.id, name: row.name, jobTitle: row.jobTitle });
    grouped.set(row.projectId, list);
  }
  return grouped;
}

function presentProject(project: typeof projects.$inferSelect) {
  return {
    id: project.id,
    name: project.name,
    location: project.location,
    description: project.description,
    startDate: project.startDate,
    endDate: project.endDate,
    status: project.status,
    budget: project.budget,
  };
}
