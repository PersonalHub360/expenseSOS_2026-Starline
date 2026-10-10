import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { removeRecordFile } from "../files/storage";
import {
  bookings,
  buyers,
  installments,
  paymentAllocations,
  payments,
  recordFiles,
  refunds,
  sales,
  units,
} from "../db/schema";
import { addMoney, compareMoney, subtractMoney } from "../projects/money";
import { allocateAcrossInstallments, applyAllocation, installmentPosition, netPayable } from "./ledger";

type SaleTerms = {
  listPrice: string;
  discount: string;
  net: string;
  installments: { label: string; dueDate: string; amount: string }[];
};

type SaleDraft = SaleTerms & {
  bookingId: string;
};

type PaymentDraft = {
  saleId: string;
  installmentId: string;
  amount: string;
  method: string;
  note: string;
  paidAt: Date;
};

type BookingDraft = {
  buyerId: string;
  unitId: string;
  amount: string;
  method: string;
  note: string;
};

type CancellationDraft = {
  bookingId: string;
  reason: string;
  refundAmount: string;
  method: string;
  note: string;
};

class TransactionDenied extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function createBooking(input: BookingDraft) {
  return run(() =>
    db.transaction(async (tx) => {
      const [buyer] = await tx.select({ id: buyers.id }).from(buyers).where(eq(buyers.id, input.buyerId)).limit(1);
      if (!buyer) throw new TransactionDenied(404, "Buyer not found.");
      const [unit] = await tx.select().from(units).where(eq(units.id, input.unitId)).limit(1).for("update");
      if (!unit) throw new TransactionDenied(404, "Unit not found.");
      if (unit.status !== "available") throw new TransactionDenied(409, unitUnavailable(unit.status));

      const now = new Date();
      const [booking] = await tx
        .insert(bookings)
        .values({
          unitId: unit.id,
          buyerId: buyer.id,
          reference: documentCode("BK"),
          amount: input.amount,
          note: input.note,
          bookedAt: now,
        })
        .returning({ id: bookings.id });
      if (!booking) throw new Error("Booking was not stored.");

      await tx.insert(payments).values({
        bookingId: booking.id,
        amount: input.amount,
        method: input.method,
        note: input.note,
        receiptNumber: documentCode("RC"),
        paidAt: now,
      });
      await tx.update(units).set({ status: "reserved", updatedAt: now }).where(eq(units.id, unit.id));
      return booking.id;
    }),
  );
}

export async function cancelBooking(input: CancellationDraft) {
  return run(() =>
    db.transaction(async (tx) => {
      const [preview] = await tx
        .select({ unitId: bookings.unitId })
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .limit(1);
      if (!preview) throw new TransactionDenied(404, "Booking not found.");

      const [unit] = await tx.select().from(units).where(eq(units.id, preview.unitId)).limit(1).for("update");
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1).for("update");
      if (!booking || !unit) throw new TransactionDenied(404, "Booking not found.");
      if (booking.status === "converted") throw new TransactionDenied(409, "This booking has already become a sale.");
      if (booking.status !== "open") throw new TransactionDenied(409, "This booking is already cancelled.");

      const bookingPayments = await tx.select().from(payments).where(eq(payments.bookingId, booking.id));
      const priorRefunds = await tx.select({ amount: refunds.amount }).from(refunds).where(eq(refunds.bookingId, booking.id));
      const received = addMoney(bookingPayments.map((payment) => payment.amount));
      const refundable = subtractMoney(received, addMoney(priorRefunds.map((refund) => refund.amount)));
      if (compareMoney(input.refundAmount, refundable) > 0) {
        throw new TransactionDenied(400, "The refund is greater than the booking money still held.");
      }

      const now = new Date();
      if (compareMoney(input.refundAmount, "0.00") > 0) {
        await tx.insert(refunds).values({
          bookingId: booking.id,
          amount: input.refundAmount,
          method: input.method,
          note: input.note || input.reason,
          receiptNumber: documentCode("RF"),
          refundedAt: now,
        });
      }
      await tx
        .update(bookings)
        .set({
          status: "cancelled",
          cancellationReason: input.reason,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(bookings.id, booking.id));
      if (unit.status === "reserved") {
        await tx.update(units).set({ status: "available", updatedAt: now }).where(eq(units.id, unit.id));
      }
      return booking.id;
    }),
  );
}

export async function createSale(input: SaleDraft) {
  return run(() =>
    db.transaction(async (tx) => {
      const priced = netPayable(input.listPrice, input.discount);
      if (!priced.ok) throw new TransactionDenied(400, priced.error);
      if (priced.net !== input.net) throw new TransactionDenied(400, "The sale total does not match the price and discount.");
      if (compareMoney(addMoney(input.installments.map((installment) => installment.amount)), priced.net) !== 0) {
        throw new TransactionDenied(400, "Installments must add up to the sale price after discount.");
      }

      const [preview] = await tx
        .select({ unitId: bookings.unitId })
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .limit(1);
      if (!preview) throw new TransactionDenied(404, "Booking not found.");

      const [unit] = await tx.select().from(units).where(eq(units.id, preview.unitId)).limit(1).for("update");
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1).for("update");
      if (!booking || !unit) throw new TransactionDenied(404, "Booking not found.");
      if (booking.status !== "open") throw new TransactionDenied(409, "Only an open booking can become a sale.");
      if (unit.status !== "reserved") throw new TransactionDenied(409, "The booked unit is not reserved.");

      const bookingPayments = byTime(
        await tx.select().from(payments).where(eq(payments.bookingId, booking.id)),
      );
      if (bookingPayments.length === 0) throw new TransactionDenied(409, "This booking has no payment receipt.");
      const received = addMoney(bookingPayments.map((payment) => payment.amount));
      if (compareMoney(received, priced.net) > 0) {
        throw new TransactionDenied(400, "Booking money is more than the price after discount.");
      }

      const now = new Date();
      const [sale] = await tx
        .insert(sales)
        .values({
          unitId: unit.id,
          buyerId: booking.buyerId,
          bookingId: booking.id,
          reference: documentCode("SL"),
          listPrice: input.listPrice,
          discount: input.discount,
          amount: priced.net,
          status: compareMoney(received, priced.net) === 0 ? "closed" : "open",
          soldAt: now,
        })
        .returning({ id: sales.id });
      if (!sale) throw new Error("Sale was not stored.");

      const storedInstallments = await tx
        .insert(installments)
        .values(
          input.installments.map((installment, index) => ({
            saleId: sale.id,
            sequence: index + 1,
            label: installment.label,
            dueDate: installment.dueDate,
            amount: installment.amount,
          })),
        )
        .returning({ id: installments.id, amount: installments.amount, sequence: installments.sequence });
      storedInstallments.sort((left, right) => left.sequence - right.sequence);

      let remainings = storedInstallments.map((installment) => ({ id: installment.id, remaining: installment.amount }));
      for (const payment of bookingPayments) {
        const allocation = allocateAcrossInstallments(payment.amount, remainings);
        if (!allocation.ok) throw new TransactionDenied(400, allocation.error);
        await tx.insert(paymentAllocations).values(
          allocation.parts.map((part) => ({
            paymentId: payment.id,
            installmentId: part.id,
            amount: part.amount,
          })),
        );
        await tx.update(payments).set({ saleId: sale.id }).where(eq(payments.id, payment.id));
        remainings = applyAllocation(remainings, allocation.parts);
      }

      await tx.update(bookings).set({ status: "converted", updatedAt: now }).where(eq(bookings.id, booking.id));
      await tx.update(units).set({ status: "sold", updatedAt: now }).where(eq(units.id, unit.id));
      return sale.id;
    }),
  );
}

export async function recordPayment(input: PaymentDraft) {
  return run(() =>
    db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1).for("update");
      if (!sale) throw new TransactionDenied(404, "Sale not found.");
      if (sale.status !== "open") throw new TransactionDenied(409, "This sale is already paid.");

      const installmentRows = await tx
        .select()
        .from(installments)
        .where(eq(installments.saleId, sale.id))
        .orderBy(installments.sequence);
      const chosen = installmentRows.find((installment) => installment.id === input.installmentId);
      if (!chosen) throw new TransactionDenied(400, "Choose an installment on this sale.");

      const salePayments = await tx.select({ amount: payments.amount }).from(payments).where(eq(payments.saleId, sale.id));
      const received = addMoney(salePayments.map((payment) => payment.amount));
      const net = netPayable(sale.listPrice, sale.discount);
      if (!net.ok) throw new TransactionDenied(409, "This sale price is no longer valid.");
      const outstanding = subtractMoney(net.net, received);
      if (compareMoney(input.amount, outstanding) > 0) {
        throw new TransactionDenied(400, "The amount is greater than the outstanding balance.");
      }

      const allocationRows = await tx
        .select({ installmentId: paymentAllocations.installmentId, amount: paymentAllocations.amount })
        .from(paymentAllocations)
        .innerJoin(installments, eq(paymentAllocations.installmentId, installments.id))
        .where(eq(installments.saleId, sale.id));
      const position = installmentPosition(installmentRows, allocationRows).find((item) => item.id === chosen.id);
      if (!position || compareMoney(input.amount, position.outstanding) > 0) {
        throw new TransactionDenied(400, "The amount is greater than the remaining installment.");
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          saleId: sale.id,
          amount: input.amount,
          method: input.method,
          note: input.note,
          receiptNumber: documentCode("RC"),
          paidAt: input.paidAt,
        })
        .returning({ id: payments.id });
      if (!payment) throw new Error("Payment was not stored.");
      await tx.insert(paymentAllocations).values({
        paymentId: payment.id,
        installmentId: chosen.id,
        amount: input.amount,
      });

      const now = new Date();
      const nextOutstanding = subtractMoney(outstanding, input.amount);
      await tx
        .update(sales)
        .set({ status: compareMoney(nextOutstanding, "0.00") === 0 ? "closed" : "open", updatedAt: now })
        .where(eq(sales.id, sale.id));
      return sale.id;
    }),
  );
}

export async function updateBooking(input: { bookingId: string; amount: string; note: string }) {
  return run(() =>
    db.transaction(async (tx) => {
      const [preview] = await tx.select({ unitId: bookings.unitId }).from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
      if (!preview) throw new TransactionDenied(404, "Booking not found.");
      await tx.select().from(units).where(eq(units.id, preview.unitId)).limit(1).for("update");
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1).for("update");
      if (!booking) throw new TransactionDenied(404, "Booking not found.");

      if (compareMoney(booking.amount, input.amount) !== 0) {
        if (booking.status !== "open") throw new TransactionDenied(409, "Only an open booking amount can be changed.");
        const bookingPayments = await tx.select().from(payments).where(eq(payments.bookingId, booking.id));
        const priorRefunds = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.bookingId, booking.id)).limit(1);
        if (priorRefunds.length > 0 || bookingPayments.length !== 1 || bookingPayments[0]?.saleId) {
          throw new TransactionDenied(409, "This booking amount is tied to a sale or more than one receipt.");
        }
        await tx.update(payments).set({ amount: input.amount }).where(eq(payments.id, bookingPayments[0].id));
      }

      await tx
        .update(bookings)
        .set({ amount: input.amount, note: input.note, updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
      return booking.id;
    }),
  );
}

export async function deleteBooking(bookingId: string) {
  return run(() =>
    db.transaction(async (tx) => {
      const [preview] = await tx.select({ unitId: bookings.unitId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
      if (!preview) throw new TransactionDenied(404, "Booking not found.");
      const [unit] = await tx.select().from(units).where(eq(units.id, preview.unitId)).limit(1).for("update");
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for("update");
      if (!booking || !unit) throw new TransactionDenied(404, "Booking not found.");
      if (booking.status === "converted") throw new TransactionDenied(409, "Delete the sale before this booking.");
      const [sale] = await tx.select({ id: sales.id }).from(sales).where(eq(sales.bookingId, booking.id)).limit(1);
      if (sale) throw new TransactionDenied(409, "Delete the sale before this booking.");

      const bookingPayments = await tx.select({ id: payments.id }).from(payments).where(eq(payments.bookingId, booking.id));
      const paymentIds = bookingPayments.map((payment) => payment.id);
      if (paymentIds.length > 0) {
        await tx.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, paymentIds));
        await tx.delete(payments).where(eq(payments.bookingId, booking.id));
      }
      await tx.delete(refunds).where(eq(refunds.bookingId, booking.id));
      await tx.delete(bookings).where(eq(bookings.id, booking.id));
      if (unit.status === "reserved") {
        await tx.update(units).set({ status: "available", updatedAt: new Date() }).where(eq(units.id, unit.id));
      }
      return booking.id;
    }),
  );
}

export async function updateSale(input: SaleTerms & { saleId: string }) {
  return run(() =>
    db.transaction(async (tx) => {
      const priced = netPayable(input.listPrice, input.discount);
      if (!priced.ok) throw new TransactionDenied(400, priced.error);
      if (priced.net !== input.net) throw new TransactionDenied(400, "The sale total does not match the price and discount.");
      if (compareMoney(addMoney(input.installments.map((installment) => installment.amount)), priced.net) !== 0) {
        throw new TransactionDenied(400, "Installments must add up to the sale price after discount.");
      }

      const [sale] = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1).for("update");
      if (!sale) throw new TransactionDenied(404, "Sale not found.");
      if (sale.status === "cancelled") throw new TransactionDenied(409, "This sale is cancelled.");
      await tx.select().from(units).where(eq(units.id, sale.unitId)).limit(1).for("update");
      if (sale.bookingId) await tx.select().from(bookings).where(eq(bookings.id, sale.bookingId)).limit(1).for("update");

      const salePayments = byTime(await tx.select().from(payments).where(eq(payments.saleId, sale.id)));
      const laterPayments = salePayments.filter((payment) => !payment.bookingId);
      const received = addMoney(salePayments.map((payment) => payment.amount));
      const now = new Date();

      if (laterPayments.length > 0) {
        if (compareMoney(sale.listPrice, input.listPrice) !== 0 || compareMoney(sale.discount, input.discount) !== 0) {
          throw new TransactionDenied(409, "This sale has payments, so the price and discount stay as they are.");
        }
        const existing = await tx.select().from(installments).where(eq(installments.saleId, sale.id)).orderBy(installments.sequence);
        if (
          existing.length !== input.installments.length ||
          existing.some((row, index) => compareMoney(row.amount, input.installments[index]?.amount ?? "0.00") !== 0)
        ) {
          throw new TransactionDenied(409, "This sale has payments, so the installment amounts stay as they are.");
        }
        for (const [index, row] of existing.entries()) {
          const next = input.installments[index];
          if (!next) continue;
          await tx
            .update(installments)
            .set({ label: next.label, dueDate: next.dueDate, updatedAt: now })
            .where(eq(installments.id, row.id));
        }
        return sale.id;
      }

      if (compareMoney(received, priced.net) > 0) {
        throw new TransactionDenied(400, "Booking money is more than the price after discount.");
      }

      const existing = await tx.select({ id: installments.id }).from(installments).where(eq(installments.saleId, sale.id));
      const installmentIds = existing.map((row) => row.id);
      if (installmentIds.length > 0) {
        await tx.delete(paymentAllocations).where(inArray(paymentAllocations.installmentId, installmentIds));
        await tx.delete(installments).where(eq(installments.saleId, sale.id));
      }

      const storedInstallments = await tx
        .insert(installments)
        .values(
          input.installments.map((installment, index) => ({
            saleId: sale.id,
            sequence: index + 1,
            label: installment.label,
            dueDate: installment.dueDate,
            amount: installment.amount,
          })),
        )
        .returning({ id: installments.id, amount: installments.amount, sequence: installments.sequence });
      storedInstallments.sort((left, right) => left.sequence - right.sequence);
      let remainings = storedInstallments.map((installment) => ({ id: installment.id, remaining: installment.amount }));
      for (const payment of salePayments) {
        const allocation = allocateAcrossInstallments(payment.amount, remainings);
        if (!allocation.ok) throw new TransactionDenied(400, allocation.error);
        await tx.insert(paymentAllocations).values(
          allocation.parts.map((part) => ({
            paymentId: payment.id,
            installmentId: part.id,
            amount: part.amount,
          })),
        );
        remainings = applyAllocation(remainings, allocation.parts);
      }

      await tx
        .update(sales)
        .set({
          listPrice: input.listPrice,
          discount: input.discount,
          amount: priced.net,
          status: compareMoney(received, priced.net) === 0 ? "closed" : "open",
          updatedAt: now,
        })
        .where(eq(sales.id, sale.id));
      return sale.id;
    }),
  );
}

export async function deleteSale(saleId: string) {
  const fileKeys: string[] = [];
  const result = await run(() =>
    db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1).for("update");
      if (!sale) throw new TransactionDenied(404, "Sale not found.");
      const [unit] = await tx.select().from(units).where(eq(units.id, sale.unitId)).limit(1).for("update");
      if (!unit) throw new TransactionDenied(404, "Sale not found.");
      if (sale.bookingId) {
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, sale.bookingId)).limit(1).for("update");
        if (!booking) throw new TransactionDenied(404, "Sale not found.");
      }

      const salePayments = await tx.select().from(payments).where(eq(payments.saleId, sale.id));
      if (salePayments.some((payment) => !payment.bookingId)) {
        throw new TransactionDenied(409, "This sale has payments and cannot be deleted.");
      }

      const installmentRows = await tx.select({ id: installments.id }).from(installments).where(eq(installments.saleId, sale.id));
      const installmentIds = installmentRows.map((row) => row.id);
      if (installmentIds.length > 0) {
        await tx.delete(paymentAllocations).where(inArray(paymentAllocations.installmentId, installmentIds));
        await tx.delete(installments).where(eq(installments.saleId, sale.id));
      }
      if (salePayments.length > 0) {
        await tx.update(payments).set({ saleId: null }).where(eq(payments.saleId, sale.id));
      }

      const files = await tx
        .select({ storageKey: recordFiles.storageKey })
        .from(recordFiles)
        .where(and(eq(recordFiles.subjectType, "sale"), eq(recordFiles.subjectId, sale.id)));
      fileKeys.push(...files.map((file) => file.storageKey));
      if (files.length > 0) {
        await tx.delete(recordFiles).where(and(eq(recordFiles.subjectType, "sale"), eq(recordFiles.subjectId, sale.id)));
      }
      await tx.delete(sales).where(eq(sales.id, sale.id));

      const now = new Date();
      if (sale.bookingId) {
        await tx.update(bookings).set({ status: "open", updatedAt: now }).where(eq(bookings.id, sale.bookingId));
      }
      if (unit.status === "sold" || unit.status === "available") {
        await tx.update(units).set({ status: "reserved", updatedAt: now }).where(eq(units.id, unit.id));
      }
      return sale.id;
    }),
  );
  if (result.ok) {
    for (const key of fileKeys) await removeRecordFile(key);
  }
  return result;
}

function unitUnavailable(status: string) {
  if (status === "reserved") return "This unit already has a booking.";
  if (status === "sold") return "This unit is already sold.";
  return "This unit is not available to book.";
}

function documentCode(prefix: "BK" | "SL" | "RC" | "RF") {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${day}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function byTime<T extends { paidAt: Date; createdAt: Date; id: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const paid = left.paidAt.getTime() - right.paidAt.getTime();
    if (paid !== 0) return paid;
    const created = left.createdAt.getTime() - right.createdAt.getTime();
    if (created !== 0) return created;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

async function run<T>(work: () => Promise<T>) {
  try {
    return { ok: true as const, id: await work() };
  } catch (error) {
    if (error instanceof TransactionDenied) return { ok: false as const, status: error.status, error: error.message };
    const mapped = mapDatabaseError(error);
    if (mapped) return { ok: false as const, status: mapped.status, error: mapped.error };
    throw error;
  }
}

function mapDatabaseError(error: unknown): { status: number; error: string } | null {
  const databaseError = readDatabaseError(error);
  if (databaseError.code === "23505") {
    return { status: 409, error: constraintMessage(databaseError.constraint) };
  }
  if (databaseError.code === "23514") return { status: 400, error: "The amount must be greater than zero." };
  if (databaseError.code === "23503") return { status: 400, error: "That record is no longer available." };
  return null;
}

function constraintMessage(constraint: string | undefined) {
  if (constraint === "bookings_open_unit_unique") return "This unit already has an open booking.";
  if (constraint === "sales_active_unit_unique") return "This unit already has a sale.";
  if (constraint === "sales_booking_unique") return "This booking is already linked to a sale.";
  if (constraint === "payments_receipt_number_unique" || constraint === "refunds_receipt_number_unique") {
    return "Could not assign a receipt number. Try again.";
  }
  if (constraint === "bookings_reference_unique" || constraint === "sales_reference_unique") {
    return "Could not assign a reference. Try again.";
  }
  return "This record conflicts with an existing booking or sale.";
}

function readDatabaseError(error: unknown): { code?: string; constraint?: string } {
  if (!error || typeof error !== "object") return {};
  const record = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  const code = typeof record.code === "string" ? record.code : undefined;
  const constraint = typeof record.constraint === "string" ? record.constraint : undefined;
  if (code) return { code, constraint };
  return readDatabaseError(record.cause);
}
