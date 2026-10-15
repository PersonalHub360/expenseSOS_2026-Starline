CREATE TABLE "purchase_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_types_name_lower_unique" ON "purchase_types" USING btree (lower("name"));
--> statement-breakpoint
INSERT INTO "purchase_types" ("name")
SELECT seed.name
FROM (VALUES ('Land purchase'), ('Materials'), ('Construction'), ('Legal & registration'), ('Transport')) AS seed(name)
WHERE NOT EXISTS (
	SELECT 1 FROM "purchase_types" existing WHERE lower(existing.name) = lower(seed.name)
);
