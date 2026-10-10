ALTER TABLE "buyers" ADD COLUMN "flat_amount" text DEFAULT '' NOT NULL;
ALTER TABLE "buyers" ADD COLUMN "size" text DEFAULT '' NOT NULL;
ALTER TABLE "buyers" ADD COLUMN "installment_payment" text DEFAULT '' NOT NULL;
ALTER TABLE "buyers" ADD COLUMN "installment_amount" text DEFAULT '' NOT NULL;
ALTER TABLE "buyers" ADD COLUMN "installment_schedule" text DEFAULT '' NOT NULL;
ALTER TABLE "buyers" ADD COLUMN "payment_alert_on" text DEFAULT '' NOT NULL;
ALTER TABLE "buyers" ADD COLUMN "deal_status" text DEFAULT '' NOT NULL;

ALTER TABLE "buyers" ADD CONSTRAINT "buyers_schedule_known" CHECK ("installment_schedule" IN ('', 'monthly', 'yearly'));
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_deal_status_known" CHECK ("deal_status" IN ('', 'booking', 'running', 'completed', 'cancelled'));
