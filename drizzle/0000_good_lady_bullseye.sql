CREATE TYPE "public"."account_type" AS ENUM('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."expense_nature" AS ENUM('FIXED', 'VARIABLE');--> statement-breakpoint
CREATE TYPE "public"."goal_kind" AS ENUM('EMERGENCY_FUND', 'PURCHASE', 'TRIP', 'DEBT_PAYOFF', 'INVESTMENT', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('CSV', 'OFX');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('PENDING', 'COMMITTED', 'DISCARDED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" DEFAULT 'CHECKING' NOT NULL,
	"institution" text,
	"color" varchar(9) DEFAULT '#6366f1' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" DEFAULT 'EXPENSE' NOT NULL,
	"nature" "expense_nature" DEFAULT 'VARIABLE' NOT NULL,
	"color" varchar(9) DEFAULT '#64748b' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"goal_id" varchar(32) NOT NULL,
	"delta_cents" integer NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"kind" "goal_kind" DEFAULT 'CUSTOM' NOT NULL,
	"target_cents" integer NOT NULL,
	"saved_cents" integer DEFAULT 0 NOT NULL,
	"target_date" timestamp with time zone,
	"color" varchar(9) DEFAULT '#0ea5e9' NOT NULL,
	"note" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"account_id" varchar(32) NOT NULL,
	"file_name" text NOT NULL,
	"source" "import_source" NOT NULL,
	"status" "import_status" DEFAULT 'PENDING' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"saved_rows" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"account_id" varchar(32) NOT NULL,
	"category_id" varchar(32),
	"date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" "category_kind" NOT NULL,
	"nature" "expense_nature" DEFAULT 'VARIABLE' NOT NULL,
	"notes" text,
	"import_batch_id" varchar(32),
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"monthly_income_cents" integer DEFAULT 0 NOT NULL,
	"emergency_months" integer DEFAULT 6 NOT NULL,
	"savings_target_pct" integer DEFAULT 20 NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_user_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_kind_key" ON "categories" USING btree ("user_id","name","kind");--> statement-breakpoint
CREATE INDEX "goal_contributions_goal_idx" ON "goal_contributions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_batches_user_idx" ON "import_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_fingerprint_key" ON "transactions" USING btree ("user_id","fingerprint");