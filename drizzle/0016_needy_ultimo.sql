CREATE TYPE "public"."finance_mode" AS ENUM('manual', 'integracao');--> statement-breakpoint
CREATE TYPE "public"."transaction_origin" AS ENUM('MANUAL', 'CSV', 'OFX', 'PLUGGY');--> statement-breakpoint
CREATE TABLE "open_finance_connections" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"item_id_envelope" text NOT NULL,
	"item_id_hash" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'NOT_SYNCED' NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error_code" text,
	"import_from_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_finance_credentials" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"client_id_envelope" text NOT NULL,
	"client_secret_envelope" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_finance_invoices" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"account_id" varchar(32) NOT NULL,
	"external_id" text NOT NULL,
	"invoice_ref" varchar(7) NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"total_amount_cents" integer,
	"minimum_payment_cents" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "finance_mode" "finance_mode" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "external_account_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "external_connection_id" varchar(32);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "bank_balance_cents" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "bank_balance_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_limit_cents" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "available_credit_cents" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_snapshot_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "origin" "transaction_origin" DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_status" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_card_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "open_finance_connections" ADD CONSTRAINT "open_finance_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_finance_credentials" ADD CONSTRAINT "open_finance_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_finance_invoices" ADD CONSTRAINT "open_finance_invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_finance_invoices" ADD CONSTRAINT "open_finance_invoices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "open_finance_connections_user_item_key" ON "open_finance_connections" USING btree ("user_id","item_id_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "open_finance_invoices_identity_key" ON "open_finance_invoices" USING btree ("user_id","account_id","external_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_external_connection_id_open_finance_connections_id_fk" FOREIGN KEY ("external_connection_id") REFERENCES "public"."open_finance_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_pluggy_identity_key" ON "transactions" USING btree ("user_id","account_id","external_id") WHERE "transactions"."external_id" is not null;