import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  json,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** BDT amounts stay exact. Money uses numeric(14, 2), not a binary floating-point column. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const projectStatus = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);
export const unitType = pgEnum("unit_type", ["plot", "flat", "unit"]);
export const unitStatus = pgEnum("unit_status", ["available", "reserved", "sold", "cancelled"]);
export const bookingStatus = pgEnum("booking_status", ["open", "converted", "cancelled"]);
export const saleStatus = pgEnum("sale_status", ["open", "closed", "cancelled"]);
export const expenseStatus = pgEnum("expense_status", ["pending", "approved", "rejected", "void_pending", "void"]);
export const expenseFrequency = pgEnum("expense_frequency", ["monthly", "quarterly", "yearly"]);
export const vendorKind = pgEnum("vendor_kind", ["supplier", "contractor"]);
export const billStatus = pgEnum("bill_status", ["pending", "open", "rejected", "void_pending", "void"]);
export const vendorPaymentStatus = pgEnum("vendor_payment_status", ["pending", "posted", "rejected"]);
export const approvalSubject = pgEnum("approval_subject", [
  "expense",
  "expense_void",
  "vendor_bill",
  "vendor_bill_void",
  "vendor_payment",
]);
export const approvalDecision = pgEnum("approval_decision", ["pending", "approved", "rejected"]);
export const accountKind = pgEnum("account_kind", ["cash", "bank"]);
export const accountTxnKind = pgEnum("account_txn_kind", ["deposit", "withdrawal", "transfer_in", "transfer_out"]);
export const employeeStatus = pgEnum("employee_status", ["active", "inactive"]);
export const salaryStatus = pgEnum("salary_status", ["scheduled", "paid"]);
export const auditAction = pgEnum("audit_action", ["create", "update", "approve", "delete"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    canView: boolean("can_view").notNull().default(false),
    canAdd: boolean("can_add").notNull().default(false),
    canEdit: boolean("can_edit").notNull().default(false),
    canDelete: boolean("can_delete").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.module] })],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamps.createdAt,
});

/** Server-side sessions. Shape matches connect-pg-simple. */
export const sessions = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    description: text("description").notNull().default(""),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: projectStatus("status").notNull().default("planning"),
    budget: money("budget").notNull().default("0.00"),
    ...timestamps,
  },
  (table) => [uniqueIndex("projects_name_unique").on(sql`lower(${table.name})`)],
);

export const buyers = pgTable("buyers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  flatAmount: text("flat_amount").notNull().default(""),
  size: text("size").notNull().default(""),
  installmentPayment: text("installment_payment").notNull().default(""),
  installmentAmount: text("installment_amount").notNull().default(""),
  installmentSchedule: text("installment_schedule").notNull().default(""),
  paymentAlertOn: text("payment_alert_on").notNull().default(""),
  dealStatus: text("deal_status").notNull().default(""),
  ...timestamps,
});

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  kind: vendorKind("kind").notNull().default("supplier"),
  ...timestamps,
});

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    jobTitle: text("job_title").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    monthlySalary: money("monthly_salary").notNull(),
    status: employeeStatus("status").notNull().default("active"),
    joinedOn: date("joined_on"),
    ...timestamps,
  },
  (table) => [check("employees_salary_non_negative", sql`${table.monthlySalary} >= 0`)],
);

export const projectStaff = pgTable(
  "project_staff",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.employeeId] })],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("general"),
    note: text("note").notNull().default(""),
    createdAt: timestamps.createdAt,
  },
  (table) => [index("documents_project_id_idx").on(table.projectId)],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    number: text("number").notNull(),
    type: unitType("type").notNull(),
    size: numeric("size", { precision: 12, scale: 2 }).notNull(),
    sizeUnit: text("size_unit").notNull(),
    location: text("location").notNull(),
    price: money("price").notNull(),
    status: unitStatus("status").notNull().default("available"),
    ...timestamps,
  },
  (table) => [uniqueIndex("units_project_number_unique").on(table.projectId, sql`lower(${table.number})`)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),
    amount: money("amount").notNull(),
    status: bookingStatus("status").notNull().default("open"),
    note: text("note").notNull().default(""),
    cancellationReason: text("cancellation_reason").notNull().default(""),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bookings_reference_unique").on(table.reference),
    uniqueIndex("bookings_open_unit_unique").on(table.unitId).where(sql`${table.status} = 'open'`),
    index("bookings_buyer_id_idx").on(table.buyerId),
    check("bookings_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),
    listPrice: money("list_price").notNull(),
    discount: money("discount").notNull().default("0.00"),
    amount: money("amount").notNull(),
    status: saleStatus("status").notNull().default("open"),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sales_reference_unique").on(table.reference),
    uniqueIndex("sales_active_unit_unique").on(table.unitId).where(sql`${table.status} <> 'cancelled'`),
    uniqueIndex("sales_booking_unique")
      .on(table.bookingId)
      .where(sql`${table.bookingId} is not null and ${table.status} <> 'cancelled'`),
    index("sales_buyer_id_idx").on(table.buyerId),
    check("sales_list_price_positive", sql`${table.listPrice} > 0`),
    check("sales_discount_non_negative", sql`${table.discount} >= 0`),
    check("sales_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const installments = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    label: text("label").notNull().default(""),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("installments_sale_sequence_unique").on(table.saleId, table.sequence),
    index("installments_sale_id_idx").on(table.saleId),
    check("installments_sequence_positive", sql`${table.sequence} > 0`),
    check("installments_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    method: text("method").notNull().default("cash"),
    note: text("note").notNull().default(""),
    receiptNumber: text("receipt_number").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("payments_receipt_number_unique").on(table.receiptNumber),
    index("payments_sale_id_idx").on(table.saleId),
    index("payments_booking_id_idx").on(table.bookingId),
    check("payments_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    installmentId: uuid("installment_id")
      .notNull()
      .references(() => installments.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
  },
  (table) => [
    uniqueIndex("payment_allocations_payment_installment_unique").on(table.paymentId, table.installmentId),
    index("payment_allocations_installment_id_idx").on(table.installmentId),
    check("payment_allocations_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    method: text("method").notNull().default("cash"),
    note: text("note").notNull().default(""),
    receiptNumber: text("receipt_number").notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("refunds_receipt_number_unique").on(table.receiptNumber),
    index("refunds_booking_id_idx").on(table.bookingId),
    check("refunds_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    note: text("note").notNull().default(""),
    method: text("method").notNull().default("cash"),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "restrict" }),
    status: expenseStatus("status").notNull().default("approved"),
    frequency: expenseFrequency("frequency"),
    nextDueDate: date("next_due_date"),
    receiptKey: text("receipt_key"),
    receiptName: text("receipt_name").notNull().default(""),
    receiptType: text("receipt_type").notNull().default(""),
    receiptBytes: integer("receipt_bytes"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    spentAt: timestamp("spent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index("expenses_project_id_idx").on(table.projectId),
    index("expenses_vendor_id_idx").on(table.vendorId),
    index("expenses_status_idx").on(table.status),
    index("expenses_spent_at_idx").on(table.spentAt),
    index("expenses_account_id_idx").on(table.accountId),
    check("expenses_amount_positive", sql`${table.amount} > 0`),
    check(
      "expenses_recurrence_pair",
      sql`(${table.frequency} is null and ${table.nextDueDate} is null) or (${table.frequency} is not null and ${table.nextDueDate} is not null)`,
    ),
  ],
);

export const vendorBills = pgTable(
  "vendor_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    reference: text("reference").notNull(),
    description: text("description").notNull().default(""),
    amount: money("amount").notNull(),
    billDate: date("bill_date").notNull(),
    dueDate: date("due_date").notNull(),
    status: billStatus("status").notNull().default("pending"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vendor_bills_reference_unique").on(table.reference),
    index("vendor_bills_vendor_id_idx").on(table.vendorId),
    index("vendor_bills_project_id_idx").on(table.projectId),
    check("vendor_bills_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const vendorPayments = pgTable(
  "vendor_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    billId: uuid("bill_id")
      .notNull()
      .references(() => vendorBills.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),
    amount: money("amount").notNull(),
    method: text("method").notNull().default("cash"),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "restrict" }),
    note: text("note").notNull().default(""),
    status: vendorPaymentStatus("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("vendor_payments_reference_unique").on(table.reference),
    index("vendor_payments_vendor_id_idx").on(table.vendorId),
    index("vendor_payments_bill_id_idx").on(table.billId),
    index("vendor_payments_account_id_idx").on(table.accountId),
    check("vendor_payments_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: approvalSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    amount: money("amount").notNull(),
    status: approvalDecision("status").notNull().default("pending"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    createdAt: timestamps.createdAt,
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    index("approvals_subject_idx").on(table.subjectType, table.subjectId),
    uniqueIndex("approvals_open_subject_unique")
      .on(table.subjectType, table.subjectId)
      .where(sql`${table.status} = 'pending'`),
    check("approvals_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const investors = pgTable(
  "investors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: timestamps.createdAt,
    shareBps: integer("share_bps").notNull().default(0),
  },
  (table) => [
    uniqueIndex("investors_name_lower_unique").on(sql`lower(${table.name})`),
    check("investors_share_bps_range", sql`${table.shareBps} >= 0 and ${table.shareBps} <= 10000`),
  ],
);

export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    investorName: text("investor_name").notNull(),
    amount: money("amount").notNull(),
    purpose: text("purpose").notNull().default(""),
    method: text("method").notNull().default("cash"),
    expectedReturn: money("expected_return").notNull().default("0.00"),
    note: text("note").notNull().default(""),
    reference: text("reference").notNull().default(""),
    investedAt: timestamp("invested_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index("investments_project_id_idx").on(table.projectId),
    check("investments_amount_positive", sql`${table.amount} > 0`),
    check("investments_expected_return_non_negative", sql`${table.expectedReturn} >= 0`),
  ],
);

export const investmentReturns = pgTable(
  "investment_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => investments.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    method: text("method").notNull().default("cash"),
    note: text("note").notNull().default(""),
    returnedAt: timestamp("returned_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index("investment_returns_investment_id_idx").on(table.investmentId),
    check("investment_returns_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: accountKind("kind").notNull(),
    accountNumber: text("account_number").notNull().default(""),
    note: text("note").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("accounts_name_unique").on(sql`lower(${table.name})`)],
);

export const accountTransactions = pgTable(
  "account_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    kind: accountTxnKind("kind").notNull(),
    amount: money("amount").notNull(),
    transferGroup: uuid("transfer_group"),
    counterAccountId: uuid("counter_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    note: text("note").notNull().default(""),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "restrict" }),
    vendorPaymentId: uuid("vendor_payment_id").references(() => vendorPayments.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index("account_transactions_account_id_idx").on(table.accountId),
    index("account_transactions_occurred_at_idx").on(table.occurredAt),
    index("account_transactions_transfer_group_idx").on(table.transferGroup),
    check("account_transactions_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const salarySlips = pgTable(
  "salary_slips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    period: text("period").notNull(),
    baseSalary: money("base_salary").notNull(),
    bonus: money("bonus").notNull().default("0.00"),
    deduction: money("deduction").notNull().default("0.00"),
    advance: money("advance").notNull().default("0.00"),
    status: salaryStatus("status").notNull().default("scheduled"),
    paidOn: date("paid_on"),
    note: text("note").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("salary_slips_employee_period_unique").on(table.employeeId, table.period),
    index("salary_slips_period_idx").on(table.period),
    check("salary_slips_base_non_negative", sql`${table.baseSalary} >= 0`),
    check("salary_slips_bonus_non_negative", sql`${table.bonus} >= 0`),
    check("salary_slips_deduction_non_negative", sql`${table.deduction} >= 0`),
    check("salary_slips_advance_non_negative", sql`${table.advance} >= 0`),
    check("salary_slips_net_non_negative", sql`${table.baseSalary} + ${table.bonus} - ${table.deduction} - ${table.advance} >= 0`),
    check("salary_slips_period_month", sql`${table.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

export const recordFiles = pgTable(
  "record_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("record_files_storage_key_unique").on(table.storageKey),
    index("record_files_subject_idx").on(table.subjectType, table.subjectId),
    check("record_files_subject_known", sql`${table.subjectType} in ('buyer', 'project', 'sale', 'expense', 'investment')`),
    check("record_files_byte_size_positive", sql`${table.byteSize} > 0`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: auditAction("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_subject_idx").on(table.subjectType, table.subjectId),
    check("audit_logs_summary_present", sql`char_length(${table.summary}) > 0`),
  ],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  units: many(units),
  staff: many(projectStaff),
  documents: many(documents),
  expenses: many(expenses),
  investments: many(investments),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  project: one(projects, { fields: [units.projectId], references: [projects.id] }),
  bookings: many(bookings),
  sales: many(sales),
}));

export const buyersRelations = relations(buyers, ({ many }) => ({
  bookings: many(bookings),
  sales: many(sales),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  unit: one(units, { fields: [bookings.unitId], references: [units.id] }),
  buyer: one(buyers, { fields: [bookings.buyerId], references: [buyers.id] }),
  sales: many(sales),
  payments: many(payments),
  refunds: many(refunds),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  unit: one(units, { fields: [sales.unitId], references: [units.id] }),
  buyer: one(buyers, { fields: [sales.buyerId], references: [buyers.id] }),
  booking: one(bookings, { fields: [sales.bookingId], references: [bookings.id] }),
  installments: many(installments),
  payments: many(payments),
}));

export const installmentsRelations = relations(installments, ({ one, many }) => ({
  sale: one(sales, { fields: [installments.saleId], references: [sales.id] }),
  allocations: many(paymentAllocations),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  sale: one(sales, { fields: [payments.saleId], references: [sales.id] }),
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  allocations: many(paymentAllocations),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  installment: one(installments, { fields: [paymentAllocations.installmentId], references: [installments.id] }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  booking: one(bookings, { fields: [refunds.bookingId], references: [bookings.id] }),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  expenses: many(expenses),
  bills: many(vendorBills),
  payments: many(vendorPayments),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  vendor: one(vendors, { fields: [expenses.vendorId], references: [vendors.id] }),
}));

export const vendorBillsRelations = relations(vendorBills, ({ one, many }) => ({
  vendor: one(vendors, { fields: [vendorBills.vendorId], references: [vendors.id] }),
  project: one(projects, { fields: [vendorBills.projectId], references: [projects.id] }),
  payments: many(vendorPayments),
}));

export const vendorPaymentsRelations = relations(vendorPayments, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorPayments.vendorId], references: [vendors.id] }),
  bill: one(vendorBills, { fields: [vendorPayments.billId], references: [vendorBills.id] }),
}));

export const investmentsRelations = relations(investments, ({ one, many }) => ({
  project: one(projects, { fields: [investments.projectId], references: [projects.id] }),
  returns: many(investmentReturns),
}));

export const investmentReturnsRelations = relations(investmentReturns, ({ one }) => ({
  investment: one(investments, { fields: [investmentReturns.investmentId], references: [investments.id] }),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(accountTransactions),
}));

export const accountTransactionsRelations = relations(accountTransactions, ({ one }) => ({
  account: one(accounts, { fields: [accountTransactions.accountId], references: [accounts.id] }),
}));

export const employeesRelations = relations(employees, ({ many }) => ({
  slips: many(salarySlips),
  assignments: many(projectStaff),
}));

export const salarySlipsRelations = relations(salarySlips, ({ one }) => ({
  employee: one(employees, { fields: [salarySlips.employeeId], references: [employees.id] }),
}));
