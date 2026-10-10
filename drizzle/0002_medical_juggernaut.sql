CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_sequence_positive" CHECK ("installments"."sequence" > 0),
	CONSTRAINT "installments_amount_positive" CHECK ("installments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"installment_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "payment_allocations_amount_positive" CHECK ("payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"receipt_number" text NOT NULL,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_booking_id_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "buyers" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_number" text;--> statement-breakpoint
UPDATE "payments" SET "receipt_number" = 'RC-LEGACY-' || replace("id"::text, '-', '') WHERE "receipt_number" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "receipt_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "list_price" numeric(14, 2);--> statement-breakpoint
UPDATE "sales" SET "list_price" = "amount" WHERE "list_price" IS NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "list_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount" numeric(14, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "installments_sale_sequence_unique" ON "installments" USING btree ("sale_id","sequence");--> statement-breakpoint
CREATE INDEX "installments_sale_id_idx" ON "installments" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_payment_installment_unique" ON "payment_allocations" USING btree ("payment_id","installment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_installment_id_idx" ON "payment_allocations" USING btree ("installment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_receipt_number_unique" ON "refunds" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "refunds_booking_id_idx" ON "refunds" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_reference_unique" ON "bookings" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_open_unit_unique" ON "bookings" USING btree ("unit_id") WHERE "bookings"."status" = 'open';--> statement-breakpoint
CREATE INDEX "bookings_buyer_id_idx" ON "bookings" USING btree ("buyer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_number_unique" ON "payments" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "payments_sale_id_idx" ON "payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "payments_booking_id_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_reference_unique" ON "sales" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_active_unit_unique" ON "sales" USING btree ("unit_id") WHERE "sales"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "sales_booking_unique" ON "sales" USING btree ("booking_id") WHERE "sales"."booking_id" is not null and "sales"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "sales_buyer_id_idx" ON "sales" USING btree ("buyer_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amount_positive" CHECK ("bookings"."amount" > 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_list_price_positive" CHECK ("sales"."list_price" > 0);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_non_negative" CHECK ("sales"."discount" >= 0);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_amount_positive" CHECK ("sales"."amount" > 0);