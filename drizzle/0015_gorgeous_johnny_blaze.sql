ALTER TABLE "bill_participants" ADD COLUMN IF NOT EXISTS "paid" boolean DEFAULT false NOT NULL;
