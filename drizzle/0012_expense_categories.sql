CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_lower_unique" ON "expense_categories" USING btree (lower("name"));
--> statement-breakpoint
INSERT INTO "expense_categories" ("name")
SELECT seed.name
FROM (VALUES ('Materials'), ('Labor'), ('Transport'), ('Utilities'), ('Office'), ('Other')) AS seed(name)
WHERE NOT EXISTS (
	SELECT 1 FROM "expense_categories" existing WHERE lower(existing.name) = lower(seed.name)
);
--> statement-breakpoint
INSERT INTO "expense_categories" ("name")
SELECT used.name
FROM (
	SELECT DISTINCT ON (lower(trim(category))) trim(category) AS name
	FROM "expenses"
	WHERE length(trim(category)) > 0
	ORDER BY lower(trim(category)), category
) used
WHERE NOT EXISTS (
	SELECT 1 FROM "expense_categories" existing WHERE lower(existing.name) = lower(used.name)
);
