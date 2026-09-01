CREATE TABLE "card_invoice_payments" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"account_id" varchar(32) NOT NULL,
	"paid_from_account_id" varchar(32),
	"due_year" integer NOT NULL,
	"due_month" integer NOT NULL,
	"paid_amount_cents" integer NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "closing_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_day" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_transfer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "card_invoice_payments" ADD CONSTRAINT "card_invoice_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_invoice_payments" ADD CONSTRAINT "card_invoice_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_invoice_payments" ADD CONSTRAINT "card_invoice_payments_paid_from_account_id_accounts_id_fk" FOREIGN KEY ("paid_from_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_invoice_payments_user_idx" ON "card_invoice_payments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_invoice_payments_key" ON "card_invoice_payments" USING btree ("user_id","account_id","due_year","due_month");