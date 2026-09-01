ALTER TABLE "accounts" ADD COLUMN "opening_balance_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_balance_date" timestamp with time zone;