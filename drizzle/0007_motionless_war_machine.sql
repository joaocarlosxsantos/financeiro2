CREATE TABLE "goal_recurring_rules" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"goal_id" varchar(32) NOT NULL,
	"amount_cents" integer NOT NULL,
	"day_of_month" integer DEFAULT 5 NOT NULL,
	"start_year" integer NOT NULL,
	"start_month" integer NOT NULL,
	"end_year" integer,
	"end_month" integer,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD COLUMN "recurring_rule_id" varchar(32);--> statement-breakpoint
ALTER TABLE "goal_recurring_rules" ADD CONSTRAINT "goal_recurring_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_recurring_rules" ADD CONSTRAINT "goal_recurring_rules_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_recurring_rules_user_idx" ON "goal_recurring_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_recurring_rules_goal_idx" ON "goal_recurring_rules" USING btree ("goal_id");--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_recurring_rule_id_goal_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."goal_recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_contributions_recurring_rule_date_key" ON "goal_contributions" USING btree ("recurring_rule_id","date");