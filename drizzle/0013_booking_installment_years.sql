ALTER TABLE "bookings" ADD COLUMN "installment_years" integer DEFAULT 0 NOT NULL;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_installment_years_range" CHECK ("installment_years" BETWEEN 0 AND 10);
