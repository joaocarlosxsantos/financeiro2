CREATE TYPE "public"."debt_kind" AS ENUM('CARD_REVOLVING', 'OVERDRAFT', 'PERSONAL_LOAN', 'FINANCING', 'INSTALLMENT', 'OTHER');--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"debt_id" varchar(32) NOT NULL,
	"amount_cents" integer NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"creditor" text,
	"kind" "debt_kind" DEFAULT 'OTHER' NOT NULL,
	"balance_cents" integer NOT NULL,
	"monthly_rate_bps" integer DEFAULT 0 NOT NULL,
	"minimum_payment_cents" integer DEFAULT 0 NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"note" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_payments_debt_idx" ON "debt_payments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "debts_user_idx" ON "debts" USING btree ("user_id");