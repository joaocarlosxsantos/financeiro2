ALTER TABLE "accounts" ADD COLUMN "closing_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_day" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "invoice_ref" varchar(7);--> statement-breakpoint
CREATE INDEX "transactions_account_invoice_idx" ON "transactions" USING btree ("account_id","invoice_ref");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_closing_day_chk" CHECK ("accounts"."closing_day" BETWEEN 1 AND 31);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_due_day_chk" CHECK ("accounts"."due_day" BETWEEN 1 AND 31);