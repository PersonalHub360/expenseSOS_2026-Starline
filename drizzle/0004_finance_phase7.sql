CREATE TYPE "public"."account_kind" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TYPE "public"."account_txn_kind" AS ENUM('deposit', 'withdrawal', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."salary_status" AS ENUM('scheduled', 'paid');--> statement-breakpoint
CREATE TABLE "account_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "account_txn_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"transfer_group" uuid,
	"counter_account_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_transactions_amount_positive" CHECK ("account_transactions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "account_kind" NOT NULL,
	"account_number" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"returned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_returns_amount_positive" CHECK ("investment_returns"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "salary_slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period" text NOT NULL,
	"base_salary" numeric(14, 2) NOT NULL,
	"bonus" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"deduction" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"advance" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"status" "salary_status" DEFAULT 'scheduled' NOT NULL,
	"paid_on" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_slips_base_non_negative" CHECK ("salary_slips"."base_salary" >= 0),
	CONSTRAINT "salary_slips_bonus_non_negative" CHECK ("salary_slips"."bonus" >= 0),
	CONSTRAINT "salary_slips_deduction_non_negative" CHECK ("salary_slips"."deduction" >= 0),
	CONSTRAINT "salary_slips_advance_non_negative" CHECK ("salary_slips"."advance" >= 0),
	CONSTRAINT "salary_slips_net_non_negative" CHECK ("salary_slips"."base_salary" + "salary_slips"."bonus" - "salary_slips"."deduction" - "salary_slips"."advance" >= 0),
	CONSTRAINT "salary_slips_period_month" CHECK ("salary_slips"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "status" "employee_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "joined_on" date;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "purpose" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "method" text DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "expected_return" numeric(14, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_counter_account_id_accounts_id_fk" FOREIGN KEY ("counter_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_returns" ADD CONSTRAINT "investment_returns_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_transactions_account_id_idx" ON "account_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_transactions_occurred_at_idx" ON "account_transactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "account_transactions_transfer_group_idx" ON "account_transactions" USING btree ("transfer_group");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_name_unique" ON "accounts" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "investment_returns_investment_id_idx" ON "investment_returns" USING btree ("investment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_slips_employee_period_unique" ON "salary_slips" USING btree ("employee_id","period");--> statement-breakpoint
CREATE INDEX "salary_slips_period_idx" ON "salary_slips" USING btree ("period");--> statement-breakpoint
CREATE INDEX "investments_project_id_idx" ON "investments" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_salary_non_negative" CHECK ("employees"."monthly_salary" >= 0);--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_amount_positive" CHECK ("investments"."amount" > 0);--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_expected_return_non_negative" CHECK ("investments"."expected_return" >= 0);