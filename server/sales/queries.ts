import { and, asc, desc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  bookings,
  buyers,
  installments,
  paymentAllocations,
  payments,
  projects,
  refunds,
  sales,
  units,
} from "../db/schema";
import { addMoney, subtractMoney } from "../projects/money";
import { buyerHistory } from "./history";
import { balanceAfter, installmentPosition, outstandingOf } from "./ledger";

type BookingFilter = { id?: string; buyerId?: string };
type SaleFilter = { id?: string; buyerId?: string };

export async function listBuyers() {
  const people = await db.select().from(buyers).orderBy(buyers.name);
  const [bookingRows, saleRows, installmentPaymentRows] = await Promise.all([loadBookings(), loadSales(), loadInstallmentPayments()]);
  return people.map((person) => {
    const ownBookings = bookingRows.filter((booking) => booking.buyer.id === person.id);
    const ownSales = saleRows.filter((sale) => sale.buyer.id === person.id && sale.status !== "cancelled");
    const projects = [
      ...new Set([...ownBookings.map((booking) => booking.project.name), ...ownSales.map((sale) => sale.project.name)]),
    ].sort((left, right) => left.localeCompare(right));
    return {
      id: person.id,
      name: person.name,
      phone: person.phone,
      email: person.email,
      address: person.address,
      projectName: person.projectName,
      flatAmount: person.flatAmount,
      size: person.size,
      installmentPayment: person.installmentPayment,
      installmentAmount: person.installmentAmount,
      installmentSchedule: person.installmentSchedule,
      paymentAlertOn: person.paymentAlertOn,
      dealStatus: person.dealStatus,
      bookings: ownBookings.length,
      openBookings: ownBookings.filter((booking) => booking.status === "open").length,
      sales: ownSales.length,
      openSales: ownSales.filter((sale) => sale.status === "open").length,
      received: addMoney(ownSales.map((sale) => sale.received)),
      outstanding: addMoney(ownSales.map((sale) => sale.outstanding)),
      projects,
      installmentPayments: installmentPaymentRows.filter((payment) => payment.buyerId === person.id).map((payment) => payment.amount),
    };
  });
}

async function loadInstallmentPayments() {
  return db
    .select({ buyerId: sales.buyerId, amount: payments.amount })
    .from(payments)
    .innerJoin(sales, eq(payments.saleId, sales.id))
    .where(and(isNull(payments.bookingId), ne(sales.status, "cancelled")))
    .orderBy(asc(payments.paidAt), asc(payments.id));
}

export async function getBuyer(id: string) {
  const [buyer] = await db.select().from(buyers).where(eq(buyers.id, id)).limit(1);
  if (!buyer) return null;
  const [bookingRows, saleRows] = await Promise.all([loadBookings({ buyerId: id }), loadSales({ buyerId: id })]);
  const bookingIds = bookingRows.map((booking) => booking.id);
  const saleIds = saleRows.map((sale) => sale.id);
  const [paymentRows, refundRows, installmentRows] = await Promise.all([
    loadRegisterPayments(saleIds, bookingIds),
    bookingIds.length
      ? db.select().from(refunds).where(inArray(refunds.bookingId, bookingIds)).orderBy(desc(refunds.refundedAt))
      : Promise.resolve([]),
    loadBuyerInstallments(saleRows),
  ]);
  const presentedRefunds = refundRows.map(presentRefund);
  return {
    buyer: presentBuyer(buyer),
    bookings: bookingRows,
    sales: saleRows,
    payments: paymentRows,
    refunds: presentedRefunds,
    history: buyerHistory({
      buyer: { notes: buyer.notes, updatedAt: buyer.updatedAt.toISOString() },
      bookings: bookingRows.map((booking) => ({
        id: booking.id,
        reference: booking.reference,
        amount: booking.amount,
        status: booking.status,
        note: booking.note,
        cancellationReason: booking.cancellationReason,
        bookedAt: booking.bookedAt,
        cancelledAt: booking.cancelledAt,
        projectName: booking.project.name,
        unitNumber: booking.unit.number,
      })),
      sales: saleRows.map((sale) => ({
        id: sale.id,
        reference: sale.reference,
        net: sale.net,
        status: sale.status,
        soldAt: sale.soldAt,
        unitNumber: sale.unit.number,
      })),
      payments: paymentRows.map((payment) => ({
        id: payment.id,
        receiptNumber: payment.receiptNumber,
        amount: payment.amount,
        method: payment.method,
        note: payment.note,
        paidAt: payment.paidAt,
        reference: payment.saleReference || payment.bookingReference,
      })),
      refunds: presentedRefunds,
      installments: installmentRows,
    }),
  };
}

export async function listBookings() {
  return loadBookings();
}

export async function getBooking(id: string) {
  const [booking] = await loadBookings({ id });
  if (!booking) return null;
  const refundRows = await db.select().from(refunds).where(eq(refunds.bookingId, id)).orderBy(desc(refunds.refundedAt));
  return { booking, refunds: refundRows.map(presentRefund) };
}

export async function listSales() {
  return loadSales();
}

export async function getSale(id: string) {
  const [sale] = await loadSales({ id });
  if (!sale) return null;
  const installmentRows = await db
    .select()
    .from(installments)
    .where(eq(installments.saleId, id))
    .orderBy(installments.sequence);
  const paymentRows = byTime(await db.select().from(payments).where(eq(payments.saleId, id)));
  const paymentIds = paymentRows.map((payment) => payment.id);
  const allocationRows = paymentIds.length
    ? await db
        .select({
          paymentId: paymentAllocations.paymentId,
          installmentId: paymentAllocations.installmentId,
          amount: paymentAllocations.amount,
          sequence: installments.sequence,
        })
        .from(paymentAllocations)
        .innerJoin(installments, eq(paymentAllocations.installmentId, installments.id))
        .where(inArray(paymentAllocations.paymentId, paymentIds))
    : [];
  const positions = installmentPosition(installmentRows, allocationRows);
  return {
    sale,
    installments: positions.map((position) => {
      const row = installmentRows.find((item) => item.id === position.id);
      return {
        id: position.id,
        sequence: row?.sequence ?? 0,
        label: row?.label ?? "",
        dueDate: row?.dueDate ?? "",
        amount: position.amount,
        received: position.received,
        outstanding: position.outstanding,
      };
    }),
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      method: payment.method,
      note: payment.note,
      paidAt: payment.paidAt.toISOString(),
      allocations: allocationRows
        .filter((allocation) => allocation.paymentId === payment.id)
        .map((allocation) => ({
          installmentId: allocation.installmentId,
          sequence: allocation.sequence,
          amount: allocation.amount,
        })),
    })),
  };
}

export async function unitCatalog() {
  return db
    .select({
      id: units.id,
      number: units.number,
      type: units.type,
      size: units.size,
      sizeUnit: units.sizeUnit,
      price: units.price,
      status: units.status,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(units)
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(ne(units.status, "cancelled"))
    .orderBy(projects.name, units.number);
}

export async function salesSummary(access: { buyers: boolean; sales: boolean; payments: boolean }) {
  const summary = {
    buyers: null as number | null,
    openBookings: null as number | null,
    openSales: null as number | null,
    collected: null as string | null,
    outstanding: null as string | null,
  };
  if (access.buyers) {
    const people = await db.select({ id: buyers.id }).from(buyers);
    summary.buyers = people.length;
  }
  if (access.sales) {
    const bookingRows = await loadBookings();
    const saleRows = await loadSales();
    summary.openBookings = bookingRows.filter((booking) => booking.status === "open").length;
    summary.openSales = saleRows.filter((sale) => sale.status === "open").length;
    summary.outstanding = addMoney(
      saleRows.filter((sale) => sale.status !== "cancelled").map((sale) => sale.outstanding),
    );
  }
  if (access.payments) {
    const [paymentRows, refundRows] = await Promise.all([
      db.select({ amount: payments.amount }).from(payments),
      db.select({ amount: refunds.amount }).from(refunds),
    ]);
    summary.collected = subtractMoney(
      addMoney(paymentRows.map((payment) => payment.amount)),
      addMoney(refundRows.map((refund) => refund.amount)),
    );
  }
  return summary;
}

export async function paymentRegister() {
  const [saleRows, bookingRows, paymentRows, refundRows] = await Promise.all([
    loadSales(),
    loadBookings(),
    db.select().from(payments).orderBy(desc(payments.paidAt)),
    db.select().from(refunds).orderBy(desc(refunds.refundedAt)),
  ]);
  const salesById = new Map(saleRows.map((sale) => [sale.id, sale]));
  const bookingsById = new Map(bookingRows.map((booking) => [booking.id, booking]));
  return {
    payments: paymentRows.map((payment) => {
      const sale = payment.saleId ? salesById.get(payment.saleId) : undefined;
      const booking = payment.bookingId ? bookingsById.get(payment.bookingId) : undefined;
      const owner = sale?.buyer ?? booking?.buyer;
      const place = sale ?? booking;
      return {
        id: payment.id,
        receiptNumber: payment.receiptNumber,
        amount: payment.amount,
        method: payment.method,
        note: payment.note,
        paidAt: payment.paidAt.toISOString(),
        buyerId: owner?.id ?? null,
        buyerName: owner?.name ?? "",
        buyerPhone: owner?.phone ?? "",
        reference: sale?.reference ?? booking?.reference ?? "",
        projectName: place?.project.name ?? "",
        unitNumber: place?.unit.number ?? "",
      };
    }),
    refunds: refundRows.map((refund) => {
      const booking = bookingsById.get(refund.bookingId);
      return {
        ...presentRefund(refund),
        buyerId: booking?.buyer.id ?? null,
        buyerName: booking?.buyer.name ?? "",
        buyerPhone: booking?.buyer.phone ?? "",
        bookingReference: booking?.reference ?? "",
        projectName: booking?.project.name ?? "",
        unitNumber: booking?.unit.number ?? "",
      };
    }),
  };
}

export async function paymentReceipt(id: string) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!payment) return null;
  const booking = payment.bookingId ? await bookingContext(payment.bookingId) : null;
  const sale = payment.saleId ? await saleContext(payment.saleId) : null;
  const buyerId = sale?.buyerId ?? booking?.buyerId;
  if (!buyerId) return null;
  const buyer = await buyerRecord(buyerId);
  if (!buyer) return null;

  let received = payment.amount;
  let outstanding = "0.00";
  if (sale) {
    const ordered = byTime(await db.select().from(payments).where(eq(payments.saleId, sale.sale.id)));
    const index = ordered.findIndex((item) => item.id === payment.id);
    if (index < 0) return null;
    const balance = balanceAfter(
      sale.net,
      ordered.map((item) => item.amount),
      index + 1,
    );
    received = balance.received;
    outstanding = balance.outstanding;
  }

  const allocationRows = await db
    .select({
      amount: paymentAllocations.amount,
      sequence: installments.sequence,
      label: installments.label,
      dueDate: installments.dueDate,
    })
    .from(paymentAllocations)
    .innerJoin(installments, eq(paymentAllocations.installmentId, installments.id))
    .where(eq(paymentAllocations.paymentId, payment.id));

  return {
    kind: "payment" as const,
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    issuedAt: payment.paidAt.toISOString(),
    amount: payment.amount,
    method: payment.method,
    note: payment.note,
    buyer,
    project: sale?.project ?? booking?.project ?? null,
    unit: sale?.unit ?? booking?.unit ?? null,
    booking: booking?.booking ?? null,
    sale: sale?.sale ?? null,
    installments: allocationRows
      .map((row) => ({ sequence: row.sequence, label: row.label, dueDate: row.dueDate, applied: row.amount }))
      .sort((left, right) => left.sequence - right.sequence),
    received,
    outstanding,
  };
}

export async function refundReceipt(id: string) {
  const [refund] = await db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
  if (!refund) return null;
  const context = await bookingContext(refund.bookingId);
  if (!context) return null;
  const buyer = await buyerRecord(context.buyerId);
  if (!buyer) return null;
  const ordered = byIssued(
    await db.select().from(refunds).where(eq(refunds.bookingId, refund.bookingId)),
  );
  const index = ordered.findIndex((item) => item.id === refund.id);
  if (index < 0) return null;
  const refunded = addMoney(ordered.slice(0, index + 1).map((item) => item.amount));
  const bookingPayments = await db.select({ amount: payments.amount }).from(payments).where(eq(payments.bookingId, refund.bookingId));
  const received = addMoney(bookingPayments.map((payment) => payment.amount));
  return {
    kind: "refund" as const,
    id: refund.id,
    receiptNumber: refund.receiptNumber,
    issuedAt: refund.refundedAt.toISOString(),
    amount: refund.amount,
    method: refund.method,
    note: refund.note,
    buyer,
    project: context.project,
    unit: context.unit,
    booking: context.booking,
    sale: null,
    installments: [],
    received,
    outstanding: subtractMoney(received, refunded),
  };
}

async function loadBookings(filter: BookingFilter = {}) {
  const conditions: SQL[] = [];
  if (filter.id) conditions.push(eq(bookings.id, filter.id));
  if (filter.buyerId) conditions.push(eq(bookings.buyerId, filter.buyerId));
  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      amount: bookings.amount,
      installmentYears: bookings.installmentYears,
      status: bookings.status,
      note: bookings.note,
      cancellationReason: bookings.cancellationReason,
      bookedAt: bookings.bookedAt,
      cancelledAt: bookings.cancelledAt,
      buyerId: buyers.id,
      buyerName: buyers.name,
      buyerPhone: buyers.phone,
      projectId: projects.id,
      projectName: projects.name,
      unitId: units.id,
      unitNumber: units.number,
      unitType: units.type,
      unitPrice: units.price,
    })
    .from(bookings)
    .innerJoin(buyers, eq(bookings.buyerId, buyers.id))
    .innerJoin(units, eq(bookings.unitId, units.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookings.bookedAt));

  const bookingIds = rows.map((row) => row.id);
  const [saleRows, paymentRows, refundRows] = await Promise.all([
    bookingIds.length
      ? db
          .select({ id: sales.id, reference: sales.reference, bookingId: sales.bookingId })
          .from(sales)
          .where(inArray(sales.bookingId, bookingIds))
      : Promise.resolve([]),
    bookingIds.length
      ? db
          .select({
            id: payments.id,
            bookingId: payments.bookingId,
            amount: payments.amount,
            receiptNumber: payments.receiptNumber,
            paidAt: payments.paidAt,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(inArray(payments.bookingId, bookingIds))
      : Promise.resolve([]),
    bookingIds.length
      ? db.select({ bookingId: refunds.bookingId, amount: refunds.amount }).from(refunds).where(inArray(refunds.bookingId, bookingIds))
      : Promise.resolve([]),
  ]);

  return rows.map((row) => {
    const ownPayments = byTime(
      paymentRows.filter((payment) => payment.bookingId === row.id).map((payment) => ({ ...payment, paidAt: payment.paidAt })),
    );
    const received = addMoney(ownPayments.map((payment) => payment.amount));
    const refunded = addMoney(refundRows.filter((refund) => refund.bookingId === row.id).map((refund) => refund.amount));
    const sale = saleRows.find((item) => item.bookingId === row.id);
    const receipt = ownPayments[0];
    return {
      id: row.id,
      reference: row.reference,
      amount: row.amount,
      installmentYears: row.installmentYears,
      status: row.status,
      note: row.note,
      cancellationReason: row.cancellationReason,
      bookedAt: row.bookedAt.toISOString(),
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      refunded,
      refundable: subtractMoney(received, refunded),
      buyer: { id: row.buyerId, name: row.buyerName, phone: row.buyerPhone },
      project: { id: row.projectId, name: row.projectName },
      unit: { id: row.unitId, number: row.unitNumber, type: row.unitType, price: row.unitPrice },
      sale: sale ? { id: sale.id, reference: sale.reference } : null,
      receipt: receipt ? { id: receipt.id, receiptNumber: receipt.receiptNumber } : null,
    };
  });
}

async function loadSales(filter: SaleFilter = {}) {
  const conditions: SQL[] = [];
  if (filter.id) conditions.push(eq(sales.id, filter.id));
  if (filter.buyerId) conditions.push(eq(sales.buyerId, filter.buyerId));
  const rows = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      listPrice: sales.listPrice,
      discount: sales.discount,
      status: sales.status,
      soldAt: sales.soldAt,
      buyerId: buyers.id,
      buyerName: buyers.name,
      buyerPhone: buyers.phone,
      buyerEmail: buyers.email,
      projectId: projects.id,
      projectName: projects.name,
      unitId: units.id,
      unitNumber: units.number,
      bookingId: bookings.id,
      bookingReference: bookings.reference,
      bookingAmount: bookings.amount,
    })
    .from(sales)
    .innerJoin(buyers, eq(sales.buyerId, buyers.id))
    .innerJoin(units, eq(sales.unitId, units.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .leftJoin(bookings, eq(sales.bookingId, bookings.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(sales.soldAt));

  const saleIds = rows.map((row) => row.id);
  const paymentRows = saleIds.length
    ? await db
        .select({ saleId: payments.saleId, amount: payments.amount })
        .from(payments)
        .where(inArray(payments.saleId, saleIds))
    : [];

  return rows.map((row) => {
    const balance = outstandingOf(
      subtractMoney(row.listPrice, row.discount),
      paymentRows.filter((payment) => payment.saleId === row.id).map((payment) => payment.amount),
    );
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      listPrice: row.listPrice,
      discount: row.discount,
      net: subtractMoney(row.listPrice, row.discount),
      received: balance.received,
      outstanding: balance.outstanding,
      soldAt: row.soldAt.toISOString(),
      buyer: { id: row.buyerId, name: row.buyerName, phone: row.buyerPhone, email: row.buyerEmail },
      project: { id: row.projectId, name: row.projectName },
      unit: { id: row.unitId, number: row.unitNumber },
      booking: row.bookingId
        ? { id: row.bookingId, reference: row.bookingReference ?? "", amount: row.bookingAmount ?? "0.00" }
        : null,
    };
  });
}

async function loadRegisterPayments(saleIds: string[], bookingIds: string[]) {
  const [bySale, byBooking] = await Promise.all([
    saleIds.length ? db.select().from(payments).where(inArray(payments.saleId, saleIds)) : Promise.resolve([]),
    bookingIds.length ? db.select().from(payments).where(inArray(payments.bookingId, bookingIds)) : Promise.resolve([]),
  ]);
  const merged = new Map<string, (typeof bySale)[number]>();
  for (const payment of [...bySale, ...byBooking]) merged.set(payment.id, payment);
  const saleRows = saleIds.length
    ? await db.select({ id: sales.id, reference: sales.reference }).from(sales).where(inArray(sales.id, saleIds))
    : [];
  const bookingRows = bookingIds.length
    ? await db.select({ id: bookings.id, reference: bookings.reference }).from(bookings).where(inArray(bookings.id, bookingIds))
    : [];
  return [...merged.values()]
    .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime())
    .map((payment) => ({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      method: payment.method,
      note: payment.note,
      paidAt: payment.paidAt.toISOString(),
      saleReference: saleRows.find((sale) => sale.id === payment.saleId)?.reference ?? "",
      bookingReference: bookingRows.find((booking) => booking.id === payment.bookingId)?.reference ?? "",
    }));
}

async function bookingContext(id: string) {
  const [row] = await db
    .select({
      buyerId: bookings.buyerId,
      bookingId: bookings.id,
      reference: bookings.reference,
      amount: bookings.amount,
      status: bookings.status,
      projectId: projects.id,
      projectName: projects.name,
      unitId: units.id,
      unitNumber: units.number,
      unitType: units.type,
    })
    .from(bookings)
    .innerJoin(units, eq(bookings.unitId, units.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(eq(bookings.id, id))
    .limit(1);
  if (!row) return null;
  return {
    buyerId: row.buyerId,
    project: { id: row.projectId, name: row.projectName },
    unit: { id: row.unitId, number: row.unitNumber, type: row.unitType },
    booking: { id: row.bookingId, reference: row.reference, amount: row.amount, status: row.status },
  };
}

async function saleContext(id: string) {
  const [row] = await db
    .select({
      buyerId: sales.buyerId,
      saleId: sales.id,
      reference: sales.reference,
      listPrice: sales.listPrice,
      discount: sales.discount,
      status: sales.status,
      projectId: projects.id,
      projectName: projects.name,
      unitId: units.id,
      unitNumber: units.number,
      unitType: units.type,
    })
    .from(sales)
    .innerJoin(units, eq(sales.unitId, units.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(eq(sales.id, id))
    .limit(1);
  if (!row) return null;
  return {
    buyerId: row.buyerId,
    project: { id: row.projectId, name: row.projectName },
    unit: { id: row.unitId, number: row.unitNumber, type: row.unitType },
    net: subtractMoney(row.listPrice, row.discount),
    sale: {
      id: row.saleId,
      reference: row.reference,
      listPrice: row.listPrice,
      discount: row.discount,
      net: subtractMoney(row.listPrice, row.discount),
      status: row.status,
    },
  };
}

async function loadBuyerInstallments(saleRows: { id: string; reference: string }[]) {
  const saleIds = saleRows.map((sale) => sale.id);
  if (!saleIds.length) return [];
  const rows = await db.select().from(installments).where(inArray(installments.saleId, saleIds)).orderBy(installments.dueDate, installments.sequence);
  const installmentIds = rows.map((row) => row.id);
  const allocations = installmentIds.length
    ? await db
        .select({ installmentId: paymentAllocations.installmentId, amount: paymentAllocations.amount })
        .from(paymentAllocations)
        .where(inArray(paymentAllocations.installmentId, installmentIds))
    : [];
  const positions = new Map(installmentPosition(rows, allocations).map((installment) => [installment.id, installment.outstanding]));
  return rows.map((installment) => ({
    id: installment.id,
    saleId: installment.saleId,
    saleReference: saleRows.find((sale) => sale.id === installment.saleId)?.reference ?? "",
    label: installment.label,
    dueDate: installment.dueDate,
    amount: installment.amount,
    outstanding: positions.get(installment.id) ?? installment.amount,
  }));
}

async function buyerRecord(id: string) {
  const [buyer] = await db.select().from(buyers).where(eq(buyers.id, id)).limit(1);
  return buyer ? presentBuyer(buyer) : null;
}

function presentBuyer(buyer: typeof buyers.$inferSelect) {
  return {
    id: buyer.id,
    name: buyer.name,
    phone: buyer.phone,
    email: buyer.email,
    address: buyer.address,
    notes: buyer.notes,
    projectName: buyer.projectName,
    flatAmount: buyer.flatAmount,
    size: buyer.size,
    installmentPayment: buyer.installmentPayment,
    installmentAmount: buyer.installmentAmount,
    installmentSchedule: buyer.installmentSchedule,
    paymentAlertOn: buyer.paymentAlertOn,
    dealStatus: buyer.dealStatus,
  };
}

function presentRefund(refund: typeof refunds.$inferSelect) {
  return {
    id: refund.id,
    receiptNumber: refund.receiptNumber,
    amount: refund.amount,
    method: refund.method,
    note: refund.note,
    refundedAt: refund.refundedAt.toISOString(),
  };
}

function byTime<T extends { paidAt: Date; createdAt: Date; id: string }>(rows: T[]) {
  return [...rows].sort(compareIssued);
}

function byIssued<T extends { refundedAt: Date; createdAt: Date; id: string }>(rows: T[]) {
  return [...rows].sort((left, right) =>
    compareIssued(
      { ...left, paidAt: left.refundedAt },
      { ...right, paidAt: right.refundedAt },
    ),
  );
}

function compareIssued(
  left: { paidAt: Date; createdAt: Date; id: string },
  right: { paidAt: Date; createdAt: Date; id: string },
) {
  const paid = left.paidAt.getTime() - right.paidAt.getTime();
  if (paid !== 0) return paid;
  const created = left.createdAt.getTime() - right.createdAt.getTime();
  if (created !== 0) return created;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
