ALTER TABLE "bill_rules" ADD COLUMN IF NOT EXISTS "due_day" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "due_day" integer;
