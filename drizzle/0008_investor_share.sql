ALTER TABLE "investors" ADD COLUMN "share_bps" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_share_bps_range" CHECK ("investors"."share_bps" >= 0 and "investors"."share_bps" <= 10000);
