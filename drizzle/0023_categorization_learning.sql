ALTER TABLE "category_rules" ADD COLUMN "match_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "category_rules" ADD COLUMN "last_applied_at" timestamp with time zone;
