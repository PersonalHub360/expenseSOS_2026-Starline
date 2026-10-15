ALTER TABLE "buyers" ADD COLUMN "project_name" text DEFAULT '' NOT NULL;
ALTER TABLE "buyers" DROP CONSTRAINT "buyers_schedule_known";
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_schedule_known" CHECK ("installment_schedule" IN ('', 'monthly', 'yearly', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'));
