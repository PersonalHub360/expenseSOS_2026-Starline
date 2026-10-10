import { eq } from "drizzle-orm";
import { writeAudit } from "../audit/log";
import { Router, type Request, type Response } from "express";
import { allows } from "../access";
import { requireAuth, requirePermission, type Principal } from "../auth/principal";
import { db } from "../db/client";
import { bookings, buyers, sales } from "../db/schema";
import { compareMoney } from "../projects/money";
import { cancelBooking, createBooking, createSale, deleteBooking, deleteSale, recordPayment, updateBooking, updateSale } from "./commands";
import {
  getBooking,
  getBuyer,
  getSale,
  listBookings,
  listBuyers,
  listSales,
  paymentReceipt,
  paymentRegister,
  refundReceipt,
  salesSummary,
  unitCatalog,
} from "./queries";
import { parseBooking, parseBookingUpdate, parseBuyer, parseCancellation, parsePayment, parseSale, parseSaleUpdate } from "./validate";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const buyersRouter = Router();
export const bookingsRouter = Router();
export const salesRouter = Router();
export const paymentsRouter = Router();
export const refundsRouter = Router();

buyersRouter.use(requireAuth);
bookingsRouter.use(requireAuth);
salesRouter.use(requireAuth);
paymentsRouter.use(requireAuth);
refundsRouter.use(requireAuth);

buyersRouter.get("/", requirePermission("buyers", "view"), async (_req, res) => {
  res.json({ buyers: await listBuyers() });
});

buyersRouter.post("/", requirePermission("buyers", "add"), async (req, res) => {
  const parsed = parseBuyer(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const [created] = await db.insert(buyers).values(parsed.value).returning({ id: buyers.id });
  if (!created) throw new Error("Buyer was not stored.");
  await writeAudit({ actorId: actor(res), action: "create", subjectType: "buyer", subjectId: created.id, summary: "Buyer created" });
  res.status(201).json(await getBuyer(created.id));
});

buyersRouter.get("/:id", requirePermission("buyers", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Buyer not found." });
    return;
  }
  const detail = await getBuyer(id);
  if (!detail) {
    res.status(404).json({ error: "Buyer not found." });
    return;
  }
  res.json(detail);
});

buyersRouter.patch("/:id", requirePermission("buyers", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Buyer not found." });
    return;
  }
  const parsed = parseBuyer(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const [existing] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Buyer not found." });
    return;
  }
  await db.update(buyers).set({ ...parsed.value, updatedAt: new Date() }).where(eq(buyers.id, id));
  await writeAudit({ actorId: actor(res), action: "update", subjectType: "buyer", subjectId: id, summary: "Buyer updated" });
  res.json(await getBuyer(id));
});

buyersRouter.delete("/:id", requirePermission("buyers", "delete"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Buyer not found." });
    return;
  }
  const [existing] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Buyer not found." });
    return;
  }
  const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.buyerId, id)).limit(1);
  const [sale] = await db.select({ id: sales.id }).from(sales).where(eq(sales.buyerId, id)).limit(1);
  if (booking || sale) {
    res.status(409).json({ error: "This buyer has bookings or sales and cannot be removed." });
    return;
  }
  await db.delete(buyers).where(eq(buyers.id, id));
  await writeAudit({ actorId: actor(res), action: "delete", subjectType: "buyer", subjectId: id, summary: "Buyer deleted" });
  res.json({ ok: true });
});

bookingsRouter.get("/", requirePermission("sales", "view"), async (_req, res) => {
  res.json({ bookings: await listBookings() });
});

bookingsRouter.post("/", requirePermission("sales", "add"), async (req, res) => {
  const parsed = parseBooking(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const created = await createBooking(parsed.value);
  if (!created.ok) {
    res.status(created.status).json({ error: created.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "create", subjectType: "booking", subjectId: created.id, summary: "Booking created" });
  res.status(201).json(await getBooking(created.id));
});

bookingsRouter.get("/:id", requirePermission("sales", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  const detail = await getBooking(id);
  if (!detail) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  res.json(detail);
});

bookingsRouter.patch("/:id", requirePermission("sales", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  const parsed = parseBookingUpdate(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const updated = await updateBooking({ bookingId: id, ...parsed.value });
  if (!updated.ok) {
    res.status(updated.status).json({ error: updated.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "update", subjectType: "booking", subjectId: updated.id, summary: "Booking updated" });
  res.json(await getBooking(updated.id));
});

bookingsRouter.delete("/:id", requirePermission("sales", "delete"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  const removed = await deleteBooking(id);
  if (!removed.ok) {
    res.status(removed.status).json({ error: removed.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "delete", subjectType: "booking", subjectId: removed.id, summary: "Booking deleted" });
  res.json({ ok: true });
});

bookingsRouter.post("/:id/cancel", requirePermission("sales", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  const parsed = parseCancellation(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (compareMoney(parsed.value.refundAmount, "0.00") > 0 && !can(res, "payments", "add")) {
    res.status(403).json({ error: "You do not have access to record a refund." });
    return;
  }
  const cancelled = await cancelBooking({ bookingId: id, ...parsed.value });
  if (!cancelled.ok) {
    res.status(cancelled.status).json({ error: cancelled.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "update", subjectType: "booking", subjectId: cancelled.id, summary: "Booking cancelled" });
  res.json(await getBooking(cancelled.id));
});

salesRouter.get("/summary", async (_req, res) => {
  res.json({
    summary: await salesSummary({
      buyers: can(res, "buyers", "view"),
      sales: can(res, "sales", "view"),
      payments: can(res, "payments", "view"),
    }),
  });
});

salesRouter.get("/catalog", requirePermission("sales", "view"), async (_req, res) => {
  res.json({ units: await unitCatalog() });
});

salesRouter.get("/", requirePermission("sales", "view"), async (_req, res) => {
  res.json({ sales: await listSales() });
});

salesRouter.post("/", requirePermission("sales", "add"), async (req, res) => {
  const parsed = parseSale(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const created = await createSale(parsed.value);
  if (!created.ok) {
    res.status(created.status).json({ error: created.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "create", subjectType: "sale", subjectId: created.id, summary: "Sale created" });
  res.status(201).json(await getSale(created.id));
});

salesRouter.get("/:id", requirePermission("sales", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Sale not found." });
    return;
  }
  const detail = await getSale(id);
  if (!detail) {
    res.status(404).json({ error: "Sale not found." });
    return;
  }
  res.json(detail);
});

salesRouter.patch("/:id", requirePermission("sales", "edit"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Sale not found." });
    return;
  }
  const parsed = parseSaleUpdate(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const updated = await updateSale({ saleId: id, ...parsed.value });
  if (!updated.ok) {
    res.status(updated.status).json({ error: updated.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "update", subjectType: "sale", subjectId: updated.id, summary: "Sale updated" });
  res.json(await getSale(updated.id));
});

salesRouter.delete("/:id", requirePermission("sales", "delete"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Sale not found." });
    return;
  }
  const removed = await deleteSale(id);
  if (!removed.ok) {
    res.status(removed.status).json({ error: removed.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "delete", subjectType: "sale", subjectId: removed.id, summary: "Sale deleted" });
  res.json({ ok: true });
});

salesRouter.post("/:id/payments", requirePermission("payments", "add"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Sale not found." });
    return;
  }
  const parsed = parsePayment(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const recorded = await recordPayment({ saleId: id, ...parsed.value });
  if (!recorded.ok) {
    res.status(recorded.status).json({ error: recorded.error });
    return;
  }
  await writeAudit({ actorId: actor(res), action: "update", subjectType: "sale", subjectId: recorded.id, summary: "Payment recorded" });
  res.status(201).json(await getSale(recorded.id));
});

paymentsRouter.get("/", requirePermission("payments", "view"), async (_req, res) => {
  res.json(await paymentRegister());
});

paymentsRouter.get("/:id/receipt", requirePermission("payments", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Receipt not found." });
    return;
  }
  const receipt = await paymentReceipt(id);
  if (!receipt) {
    res.status(404).json({ error: "Receipt not found." });
    return;
  }
  res.json({ receipt });
});

refundsRouter.get("/:id/receipt", requirePermission("payments", "view"), async (req, res) => {
  const id = routeId(req);
  if (!id) {
    res.status(404).json({ error: "Receipt not found." });
    return;
  }
  const receipt = await refundReceipt(id);
  if (!receipt) {
    res.status(404).json({ error: "Receipt not found." });
    return;
  }
  res.json({ receipt });
});

function actor(res: Response) {
  return (res.locals.principal as Principal | undefined)?.id ?? null;
}

function can(res: Response, module: "buyers" | "sales" | "payments", action: "view" | "add" | "edit" | "delete") {
  const principal = res.locals.principal as Principal | undefined;
  return allows(
    principal?.permissions.find((permission) => permission.module === module),
    action,
  );
}

function routeId(req: Request) {
  const id = req.params.id;
  const value = Array.isArray(id) ? id[0] : id;
  if (!value || !idPattern.test(value)) return null;
  return value;
}
