CREATE TYPE "public"."approval_decision" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_subject" AS ENUM('expense', 'expense_void', 'vendor_bill', 'vendor_bill_void', 'vendor_payment');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('pending', 'open', 'rejected', 'void_pending', 'void');--> statement-breakpoint
CREATE TYPE "public"."expense_frequency" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('pending', 'approved', 'rejected', 'void_pending', 'void');--> statement-breakpoint
CREATE TYPE "public"."vendor_kind" AS ENUM('supplier', 'contractor');--> statement-breakpoint
CREATE TYPE "public"."vendor_payment_status" AS ENUM('pending', 'posted', 'rejected');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "approval_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "approval_decision" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "approvals_amount_positive" CHECK ("approvals"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"project_id" uuid,
	"reference" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"bill_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "bill_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_bills_amount_positive" CHECK ("vendor_bills"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "vendor_payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_payments_amount_positive" CHECK ("vendor_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "expenses" SET "description" = "note" WHERE "description" = '' AND "note" <> '';--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "method" text DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "status" "expense_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "frequency" "expense_frequency";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "next_due_date" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_key" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_bytes" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "requested_by" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "decision_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "kind" "vendor_kind" DEFAULT 'supplier' NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_bill_id_vendor_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."vendor_bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_subject_idx" ON "approvals" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_open_subject_unique" ON "approvals" USING btree ("subject_type","subject_id") WHERE "approvals"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_bills_reference_unique" ON "vendor_bills" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "vendor_bills_vendor_id_idx" ON "vendor_bills" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_bills_project_id_idx" ON "vendor_bills" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_payments_reference_unique" ON "vendor_payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "vendor_payments_vendor_id_idx" ON "vendor_payments" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_payments_bill_id_idx" ON "vendor_payments" USING btree ("bill_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_project_id_idx" ON "expenses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "expenses_vendor_id_idx" ON "expenses" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "expenses_status_idx" ON "expenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_spent_at_idx" ON "expenses" USING btree ("spent_at");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurrence_pair" CHECK (("expenses"."frequency" is null and "expenses"."next_due_date" is null) or ("expenses"."frequency" is not null and "expenses"."next_due_date" is not null));