ALTER TABLE "import_batches" ADD COLUMN "invoice_ref" varchar(7);--> statement-breakpoint
CREATE INDEX "import_batches_invoice_idx" ON "import_batches" USING btree ("account_id","invoice_ref");