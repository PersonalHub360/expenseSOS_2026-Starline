import "dotenv/config";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { addDays } from "../expenses/dates";
import { addMoney, subtractMoney } from "../projects/money";

const testUrl = process.env.DATABASE_URL_TEST ?? "";
const enabled = testUrl.includes("starline_property_test");

let server: Server | undefined;
let base = "";
let poolEnd: (() => Promise<void>) | undefined;

before(async () => {
  if (!enabled) return;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testUrl;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "integration-test-session-secret-32";
  process.env.APP_ORIGIN = "http://127.0.0.1:5173";

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { pool, db } = await import("../db/client");
  poolEnd = () => pool.end();
  await migrate(db, { migrationsFolder: "drizzle" });
  const { seedAccessCatalog } = await import("../db/catalog");
  await seedAccessCatalog();
  await pool.query("TRUNCATE TABLE session, users RESTART IDENTITY CASCADE");

  const { hashPassword } = await import("./password");
  const { roles, users } = await import("../db/schema");
  const storedRoles = await db.select().from(roles);
  const superAdmin = storedRoles.find((role) => role.key === "super_admin");
  const viewer = storedRoles.find((role) => role.key === "viewer");
  const accountant = storedRoles.find((role) => role.key === "accountant");
  const approver = storedRoles.find((role) => role.key === "approver");
  if (!superAdmin || !viewer || !accountant || !approver) throw new Error("Role catalog was not seeded.");

  await db.insert(users).values([
    {
      email: "admin@example.test",
      username: "admin.tester",
      passwordHash: await hashPassword("admin-test-password"),
      roleId: superAdmin.id,
    },
    {
      email: "viewer@example.test",
      username: "viewer.tester",
      passwordHash: await hashPassword("viewer-test-password"),
      roleId: viewer.id,
    },
    {
      email: "accountant@example.test",
      username: "accountant.tester",
      passwordHash: await hashPassword("accountant-test-password"),
      roleId: accountant.id,
    },
    {
      email: "approver@example.test",
      username: "approver.tester",
      passwordHash: await hashPassword("approver-test-password"),
      roleId: approver.id,
    },
  ]);

  const { createApp } = await import("../app");
  const app = createApp();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
  if (poolEnd) await poolEnd();
});

function cookieFrom(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

async function login(username: string, password: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ identifier: username, password }),
  });
  return { response, cookie: cookieFrom(response) };
}

test("login, protected routes, and logout", { skip: enabled ? false : "DATABASE_URL_TEST must name starline_property_test" }, async () => {
  const anonymous = await fetch(`${base}/api/auth/me`);
  assert.equal(anonymous.status, 401);

  const denied = await fetch(`${base}/api/auth/users`);
  assert.equal(denied.status, 401);

  const failed = await login("admin.tester", "not-the-password");
  assert.equal(failed.response.status, 401);

  const admin = await login("admin.tester", "admin-test-password");
  assert.equal(admin.response.status, 200);
  assert.ok(admin.cookie.includes("starline.sid"));

  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: admin.cookie } });
  assert.equal(me.status, 200);
  const meBody = (await me.json()) as { user: { username: string } };
  assert.equal(meBody.user.username, "admin.tester");

  const users = await fetch(`${base}/api/auth/users`, { headers: { Cookie: admin.cookie } });
  assert.equal(users.status, 200);

  const viewer = await login("viewer.tester", "viewer-test-password");
  const forbidden = await fetch(`${base}/api/auth/users`, { headers: { Cookie: viewer.cookie } });
  assert.equal(forbidden.status, 403);

  const logout = await fetch(`${base}/api/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      Cookie: admin.cookie,
    },
    body: JSON.stringify({}),
  });
  assert.equal(logout.status, 200);
  const afterLogout = await fetch(`${base}/api/auth/me`, { headers: { Cookie: admin.cookie } });
  assert.equal(afterLogout.status, 401);
});

test("project summary compares budget with expenses and checks permission", { skip: enabled ? false : "DATABASE_URL_TEST must name starline_property_test" }, async () => {
  const viewer = await login("viewer.tester", "viewer-test-password");
  const denied = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      Cookie: viewer.cookie,
    },
    body: JSON.stringify({
      name: "Viewer project",
      location: "Dhaka",
      budget: "1000.00",
    }),
  });
  assert.equal(denied.status, 403);

  const admin = await login("admin.tester", "admin-test-password");
  const created = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      Cookie: admin.cookie,
    },
    body: JSON.stringify({
      name: `River View ${Date.now()}`,
      location: "Anarkoli",
      description: "Linked project summary",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "active",
      budget: "1000.00",
      staff: [{ name: "Karim Ahmed", jobTitle: "Site engineer" }],
    }),
  });
  assert.equal(created.status, 201);
  const body = (await created.json()) as {
    project: { id: string; staff: { name: string }[] };
    summary: { budget: string; actualCost: string; variance: string; counts: { documents: number } };
  };
  assert.equal(body.summary.budget, "1000.00");
  assert.equal(body.summary.actualCost, "0.00");
  assert.equal(body.summary.variance, "1000.00");
  assert.equal(body.project.staff[0]?.name, "Karim Ahmed");

  const expense = await fetch(`${base}/api/projects/${body.project.id}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      Cookie: admin.cookie,
    },
    body: JSON.stringify({ category: "Materials", amount: "250.50", note: "Cement" }),
  });
  assert.equal(expense.status, 201);
  const afterExpense = (await expense.json()) as { summary: { actualCost: string; variance: string; counts: { expenses: number } } };
  assert.equal(afterExpense.summary.actualCost, "250.50");
  assert.equal(afterExpense.summary.variance, "749.50");
  assert.equal(afterExpense.summary.counts.expenses, 1);

  const viewerExpense = await fetch(`${base}/api/projects/${body.project.id}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      Cookie: viewer.cookie,
    },
    body: JSON.stringify({ category: "Materials", amount: "10.00" }),
  });
  assert.equal(viewerExpense.status, 403);
});

test("buyer, booking, sale, installments, and balance", { skip: enabled ? false : "DATABASE_URL_TEST must name starline_property_test" }, async () => {
  const viewer = await login("viewer.tester", "viewer-test-password");
  const accountant = await login("accountant.tester", "accountant-test-password");
  const admin = await login("admin.tester", "admin-test-password");

  const rejectedBuyer = await send(viewer.cookie, "/api/buyers", "POST", {
    name: "Viewer Buyer",
    phone: "01700000000",
  });
  assert.equal(rejectedBuyer.status, 403);

  const invalidBuyer = await send(admin.cookie, "/api/buyers", "POST", {
    name: "Bad Email",
    email: "not-an-email",
  });
  assert.equal(invalidBuyer.status, 400);

  const buyer = await send(admin.cookie, "/api/buyers", "POST", {
    name: "Rahim Uddin",
    phone: "01711000000",
    email: "rahim@example.test",
    address: "House 12, Anarkoli",
    notes: "Prefers weekend calls",
  });
  assert.equal(buyer.status, 201);
  const buyerId = idOf(buyer.payload, "buyer");
  const createdBuyer = pick(buyer.payload.buyer, "buyer");
  assert.equal(createdBuyer.address, "House 12, Anarkoli");
  assert.equal(createdBuyer.notes, "Prefers weekend calls");

  const { db } = await import("../db/client");
  const { eq } = await import("drizzle-orm");
  const { projects, units } = await import("../db/schema");
  const [project] = await db
    .insert(projects)
    .values({ name: `Phase 5 ${Date.now()}`, location: "Anarkoli", budget: "0.00" })
    .returning({ id: projects.id });
  if (!project) throw new Error("Project was not stored.");
  const [firstUnit] = await db
    .insert(units)
    .values({
      projectId: project.id,
      number: "P5-01",
      type: "plot",
      size: "3.00",
      sizeUnit: "katha",
      location: "Block A",
      price: "100000.00",
    })
    .returning({ id: units.id });
  const [secondUnit] = await db
    .insert(units)
    .values({
      projectId: project.id,
      number: "P5-02",
      type: "plot",
      size: "3.00",
      sizeUnit: "katha",
      location: "Block A",
      price: "500.25",
    })
    .returning({ id: units.id });
  if (!firstUnit || !secondUnit) throw new Error("Units were not stored.");

  const deniedSale = await send(accountant.cookie, "/api/sales", "POST", { bookingId: firstUnit.id });
  assert.equal(deniedSale.status, 403);

  const booking = await send(admin.cookie, "/api/bookings", "POST", {
    buyerId,
    unitId: firstUnit.id,
    amount: "10000.10",
    method: "cash",
    note: "Booking money",
  });
  assert.equal(booking.status, 201);
  const bookingId = idOf(booking.payload, "booking");
  const booked = pick(booking.payload.booking, "booking");
  assert.equal(booked.amount, "10000.10");
  assert.equal(booked.status, "open");
  assert.ok(booked.receipt.receiptNumber.startsWith("RC-"));

  const duplicate = await send(admin.cookie, "/api/bookings", "POST", {
    buyerId,
    unitId: firstUnit.id,
    amount: "1.00",
    method: "cash",
  });
  assert.equal(duplicate.status, 409);

  const [reserved] = await db.select({ status: units.status }).from(units).where(eq(units.id, firstUnit.id));
  assert.equal(reserved?.status, "reserved");

  const sale = await send(admin.cookie, "/api/sales", "POST", {
    bookingId,
    listPrice: "100000.00",
    discount: "0.10",
    installments: [
      { label: "Installment 1", dueDate: "2026-10-03", amount: "40000.00" },
      { label: "Installment 2", dueDate: "2026-11-03", amount: "59999.90" },
    ],
  });
  assert.equal(sale.status, 201);
  const saleBody = sale.payload as SaleResponse;
  assert.equal(saleBody.sale.net, "99999.90");
  assert.equal(saleBody.sale.discount, "0.10");
  assert.equal(saleBody.sale.received, "10000.10");
  assert.equal(saleBody.sale.outstanding, "89999.80");
  assert.equal(saleBody.sale.status, "open");
  assert.equal(saleBody.installments[0]?.outstanding, "29999.90");
  assert.equal(saleBody.installments[1]?.outstanding, "59999.90");
  const saleId = saleBody.sale.id;
  const firstInstallment = saleBody.installments[0]?.id;
  const secondInstallment = saleBody.installments[1]?.id;
  if (!firstInstallment || !secondInstallment) throw new Error("Installments were not stored.");

  const [sold] = await db.select({ status: units.status }).from(units).where(eq(units.id, firstUnit.id));
  assert.equal(sold?.status, "sold");

  const bookingReceipt = await send(admin.cookie, `/api/payments/${booked.receipt.id}/receipt`, "GET");
  assert.equal(bookingReceipt.status, 200);
  const bookedReceipt = pick(bookingReceipt.payload.receipt, "receipt");
  assert.equal(bookedReceipt.received, "10000.10");
  assert.equal(bookedReceipt.outstanding, "89999.80");
  assert.equal(bookedReceipt.buyer.address, "House 12, Anarkoli");

  const viewerPayment = await send(viewer.cookie, `/api/sales/${saleId}/payments`, "POST", {
    installmentId: firstInstallment,
    amount: "1.00",
    method: "cash",
  });
  assert.equal(viewerPayment.status, 403);

  const overInstallment = await send(accountant.cookie, `/api/sales/${saleId}/payments`, "POST", {
    installmentId: secondInstallment,
    amount: "59999.91",
    method: "bank",
  });
  assert.equal(overInstallment.status, 400);

  const firstPayment = await send(accountant.cookie, `/api/sales/${saleId}/payments`, "POST", {
    installmentId: firstInstallment,
    amount: "29999.90",
    method: "bank",
    note: "Second collection",
  });
  assert.equal(firstPayment.status, 201);
  const afterFirst = pick(firstPayment.payload.sale, "sale");
  assert.equal(afterFirst.received, "40000.00");
  assert.equal(afterFirst.outstanding, "59999.90");

  const secondPayment = await send(accountant.cookie, `/api/sales/${saleId}/payments`, "POST", {
    installmentId: secondInstallment,
    amount: "59999.90",
    method: "bkash",
  });
  assert.equal(secondPayment.status, 201);
  const afterSecond = pick(secondPayment.payload.sale, "sale");
  assert.equal(afterSecond.received, "99999.90");
  assert.equal(afterSecond.outstanding, "0.00");
  assert.equal(afterSecond.status, "closed");
  const finalPayment = pick(secondPayment.payload.payments, "payments").at(-1);
  if (!finalPayment) throw new Error("Final payment was not returned.");
  const finalReceipt = await send(admin.cookie, `/api/payments/${finalPayment.id}/receipt`, "GET");
  assert.equal(finalReceipt.status, 200);
  const closedReceipt = pick(finalReceipt.payload.receipt, "receipt");
  assert.equal(closedReceipt.amount, "59999.90");
  assert.equal(closedReceipt.received, "99999.90");
  assert.equal(closedReceipt.outstanding, "0.00");

  const extra = await send(accountant.cookie, `/api/sales/${saleId}/payments`, "POST", {
    installmentId: secondInstallment,
    amount: "0.01",
    method: "cash",
  });
  assert.equal(extra.status, 409);

  const refundBooking = await send(admin.cookie, "/api/bookings", "POST", {
    buyerId,
    unitId: secondUnit.id,
    amount: "500.25",
    method: "cash",
  });
  assert.equal(refundBooking.status, 201);
  const refundBookingId = idOf(refundBooking.payload, "booking");
  const tooMuchRefund = await send(admin.cookie, `/api/bookings/${refundBookingId}/cancel`, "POST", {
    reason: "Buyer withdrew",
    refundAmount: "500.30",
    method: "cash",
  });
  assert.equal(tooMuchRefund.status, 400);
  const cancelled = await send(admin.cookie, `/api/bookings/${refundBookingId}/cancel`, "POST", {
    reason: "Buyer withdrew",
    refundAmount: "200.10",
    method: "bank",
    note: "Partial refund",
  });
  assert.equal(cancelled.status, 200);
  const cancelledBooking = pick(cancelled.payload.booking, "booking");
  assert.equal(cancelledBooking.status, "cancelled");
  assert.equal(cancelledBooking.refunded, "200.10");
  assert.equal(cancelledBooking.refundable, "300.15");
  const refund = pick(cancelled.payload.refunds, "refunds")[0];
  if (!refund) throw new Error("Refund was not stored.");
  const refundReceipt = await send(admin.cookie, `/api/refunds/${refund.id}/receipt`, "GET");
  assert.equal(refundReceipt.status, 200);
  const refundedReceipt = pick(refundReceipt.payload.receipt, "receipt");
  assert.equal(refundedReceipt.kind, "refund");
  assert.equal(refundedReceipt.amount, "200.10");
  assert.equal(refundedReceipt.received, "500.25");
  assert.equal(refundedReceipt.outstanding, "300.15");

  const [released] = await db.select({ status: units.status }).from(units).where(eq(units.id, secondUnit.id));
  assert.equal(released?.status, "available");
  const rebooked = await send(admin.cookie, "/api/bookings", "POST", {
    buyerId,
    unitId: secondUnit.id,
    amount: "150.00",
    method: "cash",
  });
  assert.equal(rebooked.status, 201);
});

test("expense totals, vendor balance, approval, and receipt checks", { skip: enabled ? false : "DATABASE_URL_TEST must name starline_property_test" }, async () => {
  const viewer = await login("viewer.tester", "viewer-test-password");
  const accountant = await login("accountant.tester", "accountant-test-password");
  const approver = await login("approver.tester", "approver-test-password");

  const deniedExpense = await post(viewer.cookie, "/api/expenses", {
    category: "Materials",
    amount: "10.00",
    spentOn: "2026-10-03",
  });
  assert.equal(deniedExpense.status, 403);

  const first = await post(accountant.cookie, "/api/expenses", {
    category: "Phase6A",
    description: "Cement",
    amount: "10.10",
    method: "cash",
    spentOn: "2026-10-01",
  });
  assert.equal(first.status, 201);
  assert.equal(first.payload.expense?.status, "approved");

  const second = await post(accountant.cookie, "/api/expenses", {
    category: "Phase6B",
    description: "Mason",
    amount: "20.20",
    method: "bank",
    spentOn: "2026-10-02",
  });
  assert.equal(second.status, 201);

  const large = await post(accountant.cookie, "/api/expenses", {
    category: "Phase6A",
    description: "Steel",
    amount: "50000.00",
    method: "cheque",
    spentOn: "2026-10-03",
  });
  assert.equal(large.status, 201);
  assert.equal(large.payload.expense?.status, "pending");
  const largeId = large.payload.expense?.id;
  if (!largeId) throw new Error("expense id missing");

  const selfApproval = await post(accountant.cookie, `/api/expenses/${largeId}/decision`, { decision: "approved" });
  assert.equal(selfApproval.status, 403);
  const viewerApproval = await post(viewer.cookie, `/api/expenses/${largeId}/decision`, { decision: "approved" });
  assert.equal(viewerApproval.status, 403);

  const beforeApproval = await get(accountant.cookie, "/api/expenses?q=Phase6");
  assert.equal(beforeApproval.payload.total, "30.30");
  assert.equal(beforeApproval.payload.pending, "50000.00");

  const approved = await post(approver.cookie, `/api/expenses/${largeId}/decision`, { decision: "approved", note: "Site steel" });
  assert.equal(approved.status, 200);
  assert.equal(approved.payload.expense?.status, "approved");

  const materials = await get(accountant.cookie, "/api/expenses?category=Phase6A&from=2026-10-01&to=2026-10-03");
  assert.equal(materials.payload.total, "50010.10");
  const labor = await get(accountant.cookie, "/api/expenses?category=Phase6B");
  assert.equal(labor.payload.total, "20.20");

  const badReceipt = await post(accountant.cookie, `/api/expenses/${largeId}/receipt`, {
    fileName: "note.pdf",
    contentType: "application/pdf",
    data: Buffer.from("hello").toString("base64"),
  });
  assert.equal(badReceipt.status, 400);
  const receipt = await post(accountant.cookie, `/api/expenses/${largeId}/receipt`, {
    fileName: "steel.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4\n").toString("base64"),
  });
  assert.equal(receipt.status, 200);
  const downloaded = await fetch(`${base}/api/expenses/${largeId}/receipt`, { headers: { Cookie: viewer.cookie } });
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get("content-type") ?? "", /pdf/);
  const anonymous = await fetch(`${base}/api/expenses/${largeId}/receipt`);
  assert.equal(anonymous.status, 401);

  const deniedVendor = await post(viewer.cookie, "/api/vendors", { name: "Viewer Vendor" });
  assert.equal(deniedVendor.status, 403);
  const vendor = await post(accountant.cookie, "/api/vendors", {
    name: "Anarkoli Cement",
    kind: "supplier",
    phone: "01713000000",
    email: "vendor@example.test",
    address: "Block B",
    notes: "Monthly supply",
  });
  assert.equal(vendor.status, 201);
  const vendorId = vendor.payload.vendor?.id;
  if (!vendorId) throw new Error("vendor id missing");

  const bill = await post(accountant.cookie, `/api/vendors/${vendorId}/bills`, {
    description: "October cement",
    amount: "1000.00",
    billDate: "2026-10-01",
    dueDate: "2026-10-15",
  });
  assert.equal(bill.status, 201);
  const openBill = bill.payload.bills?.find((item) => item.status === "open");
  if (!openBill) throw new Error("open bill missing");
  assert.equal(bill.payload.outstanding, "1000.00");

  const payment = await post(accountant.cookie, `/api/vendors/bills/${openBill.id}/payments`, {
    amount: "400.50",
    method: "bank",
  });
  assert.equal(payment.status, 201);
  assert.equal(payment.payload.outstanding, "599.50");

  const overpay = await post(accountant.cookie, `/api/vendors/bills/${openBill.id}/payments`, {
    amount: "599.51",
    method: "cash",
  });
  assert.equal(overpay.status, 400);

  const largeBill = await post(accountant.cookie, `/api/vendors/${vendorId}/bills`, {
    description: "Structure",
    amount: "60000.00",
    billDate: "2026-10-03",
    dueDate: "2026-11-03",
  });
  assert.equal(largeBill.status, 201);
  assert.equal(largeBill.payload.outstanding, "599.50");
  const pendingBill = largeBill.payload.bills?.find((item) => item.status === "pending");
  if (!pendingBill) throw new Error("pending bill missing");
  const billApproval = await post(approver.cookie, `/api/vendors/bills/${pendingBill.id}/decision`, { decision: "approved" });
  assert.equal(billApproval.status, 200);
  const afterBill = await get(accountant.cookie, `/api/vendors/${vendorId}`);
  assert.equal(afterBill.payload.outstanding, "60599.50");
});

test("investment position, account balance, and salary totals", { skip: enabled ? false : "DATABASE_URL_TEST must name starline_property_test" }, async () => {
  const viewer = await login("viewer.tester", "viewer-test-password");
  const accountant = await login("accountant.tester", "accountant-test-password");
  const stamp = Date.now().toString(36);
  const month = "2098-07";

  const denied = await financeSend(viewer.cookie, "POST", "/api/investments", {
    investorName: "Denied",
    amount: "10.00",
    investedOn: "2026-10-03",
  });
  assert.equal(denied.status, 403);

  const created = await financeSend(accountant.cookie, "POST", "/api/investments", {
    investorName: "Karim",
    amount: "1000.00",
    expectedReturn: "150.50",
    investedOn: "2026-10-01",
    purpose: "Land fill",
    method: "bank",
  });
  assert.equal(created.status, 201);
  const investmentId = created.payload.investment?.id;
  if (!investmentId) throw new Error("investment id missing");
  assert.equal(created.payload.investment?.outstanding, "1150.50");
  assert.equal(created.payload.investment?.status, "received");

  const partial = await financeSend(accountant.cookie, "POST", `/api/investments/${investmentId}/returns`, {
    amount: "400.25",
    method: "cash",
    returnedOn: "2026-10-02",
  });
  assert.equal(partial.status, 201);
  assert.equal(partial.payload.investment?.returned, "400.25");
  assert.equal(partial.payload.investment?.outstanding, "750.25");
  assert.equal(partial.payload.investment?.status, "partial");

  const closed = await financeSend(accountant.cookie, "POST", `/api/investments/${investmentId}/returns`, {
    amount: "750.25",
    method: "cash",
    returnedOn: "2026-10-03",
  });
  assert.equal(closed.status, 201);
  assert.equal(closed.payload.investment?.outstanding, "0.00");
  assert.equal(closed.payload.investment?.status, "returned");

  const extra = await financeSend(accountant.cookie, "POST", `/api/investments/${investmentId}/returns`, {
    amount: "0.01",
    method: "cash",
    returnedOn: "2026-10-04",
  });
  assert.equal(extra.status, 400);

  const cash = await financeSend(accountant.cookie, "POST", "/api/accounts", {
    name: `Phase7 Cash ${stamp}`,
    kind: "cash",
  });
  const bank = await financeSend(accountant.cookie, "POST", "/api/accounts", {
    name: `Phase7 Bank ${stamp}`,
    kind: "bank",
    accountNumber: "012345",
  });
  assert.equal(cash.status, 201);
  assert.equal(bank.status, 201);
  const cashId = cash.payload.account?.id;
  const bankId = bank.payload.account?.id;
  if (!cashId || !bankId) throw new Error("account id missing");

  const deposit = await financeSend(accountant.cookie, "POST", `/api/accounts/${cashId}/transactions`, {
    kind: "deposit",
    amount: "1000.10",
    occurredOn: "2026-10-01",
  });
  assert.equal(deposit.payload.account?.balance, "1000.10");
  const withdrawal = await financeSend(accountant.cookie, "POST", `/api/accounts/${cashId}/transactions`, {
    kind: "withdrawal",
    amount: "200.05",
    occurredOn: "2026-10-02",
  });
  assert.equal(withdrawal.payload.account?.balance, "800.05");
  const transfer = await financeSend(accountant.cookie, "POST", "/api/accounts/transfers", {
    fromAccountId: cashId,
    toAccountId: bankId,
    amount: "300.00",
    occurredOn: "2026-10-03",
  });
  assert.equal(transfer.status, 201);
  assert.equal(transfer.payload.source?.account.balance, "500.05");
  assert.equal(transfer.payload.target?.account.balance, "300.00");

  const overdraw = await financeSend(accountant.cookie, "POST", `/api/accounts/${bankId}/transactions`, {
    kind: "withdrawal",
    amount: "300.01",
    occurredOn: "2026-10-04",
  });
  assert.equal(overdraw.status, 400);
  const sameAccount = await financeSend(accountant.cookie, "POST", "/api/accounts/transfers", {
    fromAccountId: cashId,
    toAccountId: cashId,
    amount: "1.00",
    occurredOn: "2026-10-04",
  });
  assert.equal(sameAccount.status, 400);

  const before = await financeSend(accountant.cookie, "GET", `/api/employees/summary?month=${month}`);
  const firstEmployee = await financeSend(accountant.cookie, "POST", "/api/employees", {
    name: `Phase7 One ${stamp}`,
    monthlySalary: "20000.00",
    phone: "01711000001",
  });
  const secondEmployee = await financeSend(accountant.cookie, "POST", "/api/employees", {
    name: `Phase7 Two ${stamp}`,
    monthlySalary: "10000.00",
  });
  assert.equal(firstEmployee.status, 201);
  const firstId = firstEmployee.payload.employee?.id;
  const secondId = secondEmployee.payload.employee?.id;
  if (!firstId || !secondId) throw new Error("employee id missing");

  const firstSlip = await financeSend(accountant.cookie, "POST", `/api/employees/${firstId}/slips`, {
    period: month,
    bonus: "1500.50",
    deduction: "200.25",
    advance: "300.00",
    status: "paid",
    paidOn: "2026-10-03",
  });
  assert.equal(firstSlip.status, 201);
  assert.equal(firstSlip.payload.slip?.net, "21000.25");
  const secondSlip = await financeSend(accountant.cookie, "POST", `/api/employees/${secondId}/slips`, {
    period: month,
    status: "scheduled",
  });
  assert.equal(secondSlip.payload.slip?.net, "10000.00");

  const summary = await financeSend(accountant.cookie, "GET", `/api/employees/summary?month=${month}`);
  assert.equal(summary.payload.totals?.base, addMoney([before.payload.totals?.base ?? "0.00", "30000.00"]));
  assert.equal(summary.payload.totals?.bonus, addMoney([before.payload.totals?.bonus ?? "0.00", "1500.50"]));
  assert.equal(summary.payload.totals?.deduction, addMoney([before.payload.totals?.deduction ?? "0.00", "200.25"]));
  assert.equal(summary.payload.totals?.advance, addMoney([before.payload.totals?.advance ?? "0.00", "300.00"]));
  assert.equal(summary.payload.totals?.net, addMoney([before.payload.totals?.net ?? "0.00", "31000.25"]));

  const viewerWrite = await financeSend(viewer.cookie, "POST", "/api/accounts", { name: `Blocked ${stamp}`, kind: "cash" });
  assert.equal(viewerWrite.status, 403);
});

test("dashboard figures match sales, expenses, investments, and cash", { skip: enabled ? false : "DATABASE_URL_TEST must name starline_property_test" }, async () => {
  const admin = await login("admin.tester", "admin-test-password");
  const viewer = await login("viewer.tester", "viewer-test-password");
  const stamp = Date.now().toString(36);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = addDays(today, 1);

  const { db } = await import("../db/client");
  const { projects, units } = await import("../db/schema");
  const [project] = await db
    .insert(projects)
    .values({ name: `Phase 8 ${stamp}`, location: "Anarkoli", budget: "250.00" })
    .returning({ id: projects.id });
  if (!project) throw new Error("Project was not stored.");
  const [soldUnit] = await db
    .insert(units)
    .values({ projectId: project.id, number: "P8-01", type: "plot", size: "3.00", sizeUnit: "katha", location: "Block A", price: "80.00" })
    .returning({ id: units.id });
  const [refundUnit] = await db
    .insert(units)
    .values({ projectId: project.id, number: "P8-02", type: "plot", size: "3.00", sizeUnit: "katha", location: "Block A", price: "15.00" })
    .returning({ id: units.id });
  if (!soldUnit || !refundUnit) throw new Error("Units were not stored.");

  const buyer = await phase8(admin.cookie, "POST", "/api/buyers", {
    name: `Phase 8 ${stamp}`,
    phone: "01712000008",
    notes: "Phase 8 timeline",
  });
  assert.equal(buyer.status, 201);
  const buyerId = recordId(buyer.payload.buyer, "buyer");
  const booking = await phase8(admin.cookie, "POST", "/api/bookings", {
    buyerId,
    unitId: soldUnit.id,
    amount: "10.00",
    method: "cash",
    note: "Phase 8 booking",
  });
  assert.equal(booking.status, 201);
  const bookingId = recordId(booking.payload.booking, "booking");
  const sale = await phase8(admin.cookie, "POST", "/api/sales", {
    bookingId,
    listPrice: "80.00",
    discount: "0.00",
    installments: [{ label: "Overdue", dueDate: "2020-01-01", amount: "80.00" }],
  });
  assert.equal(sale.status, 201);
  const saleId = recordId(sale.payload.sale, "sale");

  const refundBooking = await phase8(admin.cookie, "POST", "/api/bookings", {
    buyerId,
    unitId: refundUnit.id,
    amount: "15.00",
    method: "cash",
  });
  assert.equal(refundBooking.status, 201);
  const cancelled = await phase8(admin.cookie, "POST", `/api/bookings/${recordId(refundBooking.payload.booking, "booking")}/cancel`, {
    reason: "Buyer withdrew",
    refundAmount: "5.00",
    method: "cash",
    note: "Phase 8 refund",
  });
  assert.equal(cancelled.status, 200);

  const ranged = await phase8(admin.cookie, "POST", "/api/expenses", {
    category: `Phase8Range ${stamp}`,
    amount: "7.07",
    spentOn: "2019-08-21",
    method: "cash",
  });
  assert.equal(ranged.status, 201);
  const upcoming = await phase8(admin.cookie, "POST", "/api/expenses", {
    category: `Phase8Due ${stamp}`,
    description: "Site visit",
    amount: "12.12",
    spentOn: today,
    method: "cash",
    frequency: "monthly",
    nextDueDate: tomorrow,
  });
  assert.equal(upcoming.status, 201);
  const pending = await phase8(admin.cookie, "POST", "/api/expenses", {
    category: `Phase8Pending ${stamp}`,
    amount: "50000.00",
    spentOn: today,
    method: "bank",
  });
  assert.equal(pending.status, 201);
  const pendingId = recordId(pending.payload.expense, "expense");
  const upcomingId = recordId(upcoming.payload.expense, "expense");

  const dashboard = await phase8(admin.cookie, "GET", "/api/dashboard");
  const report = dashboard.payload as DashboardReport;
  const [salesSummary, expenseSummary, investmentList, accountList, projectList, saleList, expenseList] = await Promise.all([
    phase8(admin.cookie, "GET", "/api/sales/summary"),
    phase8(admin.cookie, "GET", "/api/expenses/summary"),
    phase8(admin.cookie, "GET", "/api/investments"),
    phase8(admin.cookie, "GET", "/api/accounts"),
    phase8(admin.cookie, "GET", "/api/projects"),
    phase8(admin.cookie, "GET", "/api/sales"),
    phase8(admin.cookie, "GET", "/api/expenses?from=2019-08-21&to=2019-08-21"),
  ]);
  const summary = salesSummary.payload.summary as { collected: string; outstanding: string };
  const expenses = expenseSummary.payload.summary as { total: string };
  const investments = investmentList.payload as { received: string };
  const accounts = accountList.payload as { total: string };
  const projectsPayload = projectList.payload as { projects: { actualCost: string }[] };
  const salesPayload = saleList.payload as { sales: { status: string; net: string }[] };
  assert.equal(report.period.received, summary.collected);
  assert.equal(report.current.buyerDues, summary.outstanding);
  assert.equal(report.period.expenses, expenses.total);
  assert.equal(report.period.investments, investments.received);
  assert.equal(report.current.cashBalance, accounts.total);
  assert.equal(report.period.projectCosts, addMoney(projectsPayload.projects.map((item) => item.actualCost)));
  assert.equal(report.period.sales, addMoney(salesPayload.sales.filter((item) => item.status !== "cancelled").map((item) => item.net)));
  assert.equal(report.period.profit, subtractMoney(report.period.received, report.period.expenses));
  assert.equal(addMoney(report.months.map((month) => month.sales)), report.period.sales);
  assert.equal(addMoney(report.months.map((month) => month.expenses)), report.period.expenses);
  assert.equal(addMoney(report.projects.map((item) => item.actualCost)), report.period.projectCosts);

  const filtered = await phase8(admin.cookie, "GET", "/api/dashboard?from=2019-08-21&to=2019-08-21");
  const filteredReport = filtered.payload as DashboardReport;
  assert.equal(filteredReport.period.expenses, (expenseList.payload as { total: string }).total);
  assert.equal(filteredReport.period.projectCosts, "0.00");
  assert.equal(addMoney(filteredReport.months.map((month) => month.expenses)), filteredReport.period.expenses);
  assert.equal(filteredReport.current.buyerDues, report.current.buyerDues);

  const badRange = await phase8(admin.cookie, "GET", "/api/dashboard?from=2026-12-31&to=2026-01-01");
  assert.equal(badRange.status, 400);
  const viewerDashboard = await phase8(viewer.cookie, "GET", "/api/dashboard");
  assert.equal(viewerDashboard.status, 200);
  assert.equal((viewerDashboard.payload as DashboardReport).period.received, report.period.received);

  const notices = await phase8(admin.cookie, "GET", "/api/dashboard/notifications");
  const notifications = (notices.payload as { notifications: DashboardReport["notifications"] }).notifications;
  const overdue = notifications.find((item) => item.kind === "overdue" && item.href === `/sales/${saleId}`);
  assert.equal(overdue?.amount, "70.00");
  assert.ok(notifications.some((item) => item.kind === "upcoming" && item.href === `/expenses/${upcomingId}`));
  assert.ok(notifications.some((item) => item.kind === "approval" && item.href === `/expenses/${pendingId}`));
  assert.ok(report.overdue.some((item) => item.href === `/sales/${saleId}`));
  assert.ok(report.pendingApprovals.some((item) => item.href === `/expenses/${pendingId}`));

  const buyerDetail = await phase8(admin.cookie, "GET", `/api/buyers/${buyerId}`);
  const history = buyerDetail.payload.history as { kind: string; at: string; amount: string | null }[];
  for (const kind of ["note", "booking", "sale", "payment", "installment", "due", "refund"]) {
    assert.ok(history.some((event) => event.kind === kind), kind);
  }
  const times = history.map((event) => event.at);
  assert.deepEqual(times, [...times].sort((left, right) => left.localeCompare(right)));
  assert.equal(history.find((event) => event.kind === "due")?.amount, "70.00");
});

test("report totals match sales, expenses, investments, projects, salary, and cash", { skip: enabled ? false : "DATABASE_URL_TEST must name starline_property_test" }, async () => {
  const admin = await login("admin.tester", "admin-test-password");
  const viewer = await login("viewer.tester", "viewer-test-password");
  const stamp = Date.now().toString(36);
  const phone = `01719${String(Date.now()).slice(-6)}`;

  const [salesSummary, expenseSummary, investmentList, accountList, projectList, saleList, salarySummary] = await Promise.all([
    phase8(admin.cookie, "GET", "/api/sales/summary"),
    phase8(admin.cookie, "GET", "/api/expenses/summary"),
    phase8(admin.cookie, "GET", "/api/investments"),
    phase8(admin.cookie, "GET", "/api/accounts"),
    phase8(admin.cookie, "GET", "/api/projects"),
    phase8(admin.cookie, "GET", "/api/sales"),
    phase8(admin.cookie, "GET", "/api/employees/summary?month=2098-07"),
  ]);
  const summary = salesSummary.payload.summary as { collected: string; outstanding: string };
  const expenses = expenseSummary.payload.summary as { total: string };
  const investments = investmentList.payload as { received: string };
  const accounts = accountList.payload as { total: string };
  const projectsPayload = projectList.payload as { projects: { actualCost: string }[] };
  const salesPayload = saleList.payload as { sales: { status: string; net: string }[] };

  const salesReport = await reportOf(admin.cookie, "sales");
  assert.equal(totalOf(salesReport, "netCollected"), summary.collected);
  assert.equal(totalOf(salesReport, "sales"), addMoney(salesPayload.sales.filter((sale) => sale.status !== "cancelled").map((sale) => sale.net)));
  const duesReport = await reportOf(admin.cookie, "dues");
  assert.equal(totalOf(duesReport, "outstanding"), summary.outstanding);
  const expenseReport = await reportOf(admin.cookie, "expenses");
  assert.equal(totalOf(expenseReport, "expenses"), expenses.total);
  const investmentReport = await reportOf(admin.cookie, "investments");
  assert.equal(totalOf(investmentReport, "principal"), investments.received);
  const projectReport = await reportOf(admin.cookie, "projects");
  assert.equal(totalOf(projectReport, "actualCost"), addMoney(projectsPayload.projects.map((project) => project.actualCost)));
  const cashReport = await reportOf(admin.cookie, "cashflow");
  assert.equal(totalOf(cashReport, "net"), accounts.total);
  const profitReport = await reportOf(admin.cookie, "profit");
  assert.equal(totalOf(profitReport, "received"), summary.collected);
  assert.equal(totalOf(profitReport, "expenses"), expenses.total);
  assert.equal(totalOf(profitReport, "profit"), subtractMoney(summary.collected, expenses.total));
  assert.equal(addMoney(profitReport.rows.map((row) => row.received ?? "0.00")), totalOf(profitReport, "received"));
  assert.equal(addMoney(profitReport.rows.map((row) => row.expenses ?? "0.00")), totalOf(profitReport, "expenses"));

  const salaryReport = await reportOf(admin.cookie, "salary", "from=2098-07-01&to=2098-07-31");
  const salary = salarySummary.payload.totals as { base: string; bonus: string; deduction: string; advance: string; net: string };
  assert.equal(totalOf(salaryReport, "base"), salary.base);
  assert.equal(totalOf(salaryReport, "bonus"), salary.bonus);
  assert.equal(totalOf(salaryReport, "deduction"), salary.deduction);
  assert.equal(totalOf(salaryReport, "advance"), salary.advance);
  assert.equal(totalOf(salaryReport, "net"), salary.net);

  const exported = await fetch(`${base}/api/reports/dues?format=csv`, { headers: { Cookie: admin.cookie } });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(await exported.text(), new RegExp(summary.outstanding.replace(".", "\\.")));
  const viewerReport = await phase8(viewer.cookie, "GET", "/api/reports/sales");
  assert.equal(viewerReport.status, 200);

  const buyer = await phase8(admin.cookie, "POST", "/api/buyers", {
    name: `Phase 9 ${stamp}`,
    phone,
    notes: `secret-note-${stamp}`,
  });
  assert.equal(buyer.status, 201);
  const buyerId = recordId(buyer.payload.buyer, "buyer");
  const denied = await phase8(viewer.cookie, "POST", "/api/files", {
    subjectType: "buyer",
    subjectId: buyerId,
    title: "Blocked",
    fileName: "note.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4\n").toString("base64"),
  });
  assert.equal(denied.status, 403);
  const uploaded = await phase8(admin.cookie, "POST", "/api/files", {
    subjectType: "buyer",
    subjectId: buyerId,
    title: "Agreement",
    fileName: "note.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64"),
  });
  assert.equal(uploaded.status, 201);
  const fileId = recordId(uploaded.payload.file, "file");
  const download = await fetch(`${base}/api/files/${fileId}`, { headers: { Cookie: viewer.cookie } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type") ?? "", /pdf/);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "%PDF");
  const viewerDelete = await phase8(viewer.cookie, "DELETE", `/api/files/${fileId}`, {});
  assert.equal(viewerDelete.status, 403);

  const audit = await phase8(admin.cookie, "GET", "/api/audit");
  const entries = audit.payload.entries as { subjectId: string; summary: string; action: string; actor: string }[];
  const created = entries.find((entry) => entry.subjectId === buyerId && entry.summary === "Buyer created");
  assert.equal(created?.action, "create");
  assert.equal(created?.actor, "admin.tester");
  const dumped = JSON.stringify(entries);
  assert.equal(dumped.includes(phone), false);
  assert.equal(dumped.includes(`secret-note-${stamp}`), false);
});

function totalOf(report: { totals: { key: string; value: string }[] }, key: string) {
  const total = report.totals.find((item) => item.key === key);
  if (!total) throw new Error(`${key} missing`);
  return total.value;
}

async function reportOf(cookie: string, kind: string, query = "") {
  const response = await phase8(cookie, "GET", `/api/reports/${kind}${query ? `?${query}` : ""}`);
  assert.equal(response.status, 200);
  const report = response.payload.report as { totals: { key: string; value: string }[]; rows: Record<string, string>[] };
  if (!report) throw new Error("report missing");
  return report;
}

type DashboardReport = {
  period: { sales: string; received: string; expenses: string; projectCosts: string; investments: string; profit: string };
  current: { buyerDues: string; cashBalance: string };
  months: { sales: string; expenses: string }[];
  projects: { actualCost: string }[];
  overdue: { href: string }[];
  pendingApprovals: { href: string }[];
  notifications: { kind: string; href: string; amount: string }[];
};

async function phase8(cookie: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173" }),
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, payload };
}

function recordId(value: unknown, label: string) {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") throw new Error(`${label} id missing`);
  return value.id;
}

type ExpenseApi = {
  expense?: { id: string; status: string };
  total?: string;
  pending?: string;
  vendor?: { id: string };
  bills?: { id: string; status: string }[];
  outstanding?: string;
};

async function post(cookie: string, path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ExpenseApi;
  return { status: response.status, payload };
}

async function get(cookie: string, path: string) {
  const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  const payload = (await response.json().catch(() => ({}))) as ExpenseApi;
  return { status: response.status, payload };
}

type SaleResponse = {
  sale: { id: string; net: string; discount: string; received: string; outstanding: string; status: string };
  installments: { id: string; outstanding: string }[];
  payments: { id: string }[];
};

type ApiPayload = {
  buyer?: { id: string; address: string; notes: string };
  booking?: {
    id: string;
    amount: string;
    status: string;
    refunded: string;
    refundable: string;
    receipt: { id: string; receiptNumber: string };
  };
  refunds?: { id: string }[];
  sale?: SaleResponse["sale"];
  installments?: SaleResponse["installments"];
  payments?: SaleResponse["payments"];
  receipt?: { kind: string; amount: string; received: string; outstanding: string; buyer: { address: string } };
};

async function send(cookie: string, path: string, method: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173" }),
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload;
  return { status: response.status, payload };
}

function idOf(payload: ApiPayload, key: "buyer" | "booking") {
  const id = payload[key]?.id;
  if (typeof id !== "string") throw new Error(`${key} id missing`);
  return id;
}

function pick<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} missing`);
  return value;
}

type FinancePayload = {
  investment?: { id: string; returned: string; outstanding: string; status: string };
  account?: { id: string; balance: string };
  source?: { account: { balance: string } };
  target?: { account: { balance: string } };
  employee?: { id: string };
  slip?: { net: string };
  totals?: { base: string; bonus: string; deduction: string; advance: string; net: string };
};

async function financeSend(cookie: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173" }),
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as FinancePayload;
  return { status: response.status, payload };
}
