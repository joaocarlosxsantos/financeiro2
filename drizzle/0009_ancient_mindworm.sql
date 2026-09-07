CREATE TYPE "public"."bill_type" AS ENUM('INDIVIDUAL', 'GROUP');--> statement-breakpoint
CREATE TABLE "bill_groupings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"color" varchar(9) DEFAULT '#64748b' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_participants" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"bill_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_rule_participants" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"rule_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_rules" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"grouping_id" varchar(32),
	"name" text NOT NULL,
	"type" "bill_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"rule_id" varchar(32),
	"grouping_id" varchar(32),
	"name" text NOT NULL,
	"type" "bill_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_groupings" ADD CONSTRAINT "bill_groupings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_participants" ADD CONSTRAINT "bill_participants_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_rule_participants" ADD CONSTRAINT "bill_rule_participants_rule_id_bill_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."bill_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_rules" ADD CONSTRAINT "bill_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_rules" ADD CONSTRAINT "bill_rules_grouping_id_bill_groupings_id_fk" FOREIGN KEY ("grouping_id") REFERENCES "public"."bill_groupings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_rule_id_bill_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."bill_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_grouping_id_bill_groupings_id_fk" FOREIGN KEY ("grouping_id") REFERENCES "public"."bill_groupings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_groupings_user_idx" ON "bill_groupings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bill_participants_bill_idx" ON "bill_participants" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bill_rule_participants_rule_idx" ON "bill_rule_participants" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "bill_rules_user_idx" ON "bill_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bills_user_period_idx" ON "bills" USING btree ("user_id","year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_rule_period_key" ON "bills" USING btree ("rule_id","year","month");