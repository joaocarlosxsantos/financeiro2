CREATE TABLE "recurring_rules" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"account_id" varchar(32) NOT NULL,
	"category_id" varchar(32),
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" "category_kind" NOT NULL,
	"nature" "expense_nature" DEFAULT 'FIXED' NOT NULL,
	"notes" text,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"start_year" integer NOT NULL,
	"start_month" integer NOT NULL,
	"end_year" integer,
	"end_month" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_rule_id" varchar(32);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_group_id" varchar(32);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_number" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_total" integer;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_rules_user_idx" ON "recurring_rules" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_recurring_idx" ON "transactions" USING btree ("recurring_rule_id");--> statement-breakpoint
CREATE INDEX "transactions_installment_idx" ON "transactions" USING btree ("installment_group_id");