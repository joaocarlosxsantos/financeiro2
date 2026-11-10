CREATE TABLE "shared_expense_shares" (
	"group_id" varchar(32) NOT NULL,
	"expense_id" varchar(32) NOT NULL,
	"member_id" varchar(32) NOT NULL,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "shared_shares_amount_chk" CHECK ("shared_expense_shares"."amount_cents" between 0 and 2000000000)
);
--> statement-breakpoint
CREATE TABLE "shared_expenses" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"group_id" varchar(32) NOT NULL,
	"payer_id" varchar(32) NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_expenses_group_id_key" UNIQUE("group_id","id"),
	CONSTRAINT "shared_expenses_positive_chk" CHECK ("shared_expenses"."amount_cents" between 1 and 2000000000)
);
--> statement-breakpoint
CREATE TABLE "shared_groups" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_members" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"group_id" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "shared_members_group_id_key" UNIQUE("group_id","id")
);
--> statement-breakpoint
CREATE TABLE "shared_settlements" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"group_id" varchar(32) NOT NULL,
	"from_id" varchar(32) NOT NULL,
	"to_id" varchar(32) NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_settlements_amount_chk" CHECK ("shared_settlements"."amount_cents" between 1 and 2000000000 and "shared_settlements"."from_id" <> "shared_settlements"."to_id")
);
--> statement-breakpoint
ALTER TABLE "shared_expense_shares" ADD CONSTRAINT "shared_shares_group_expense_fk" FOREIGN KEY ("group_id","expense_id") REFERENCES "public"."shared_expenses"("group_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_shares" ADD CONSTRAINT "shared_shares_group_member_fk" FOREIGN KEY ("group_id","member_id") REFERENCES "public"."shared_members"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_group_id_shared_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shared_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_group_payer_fk" FOREIGN KEY ("group_id","payer_id") REFERENCES "public"."shared_members"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_groups" ADD CONSTRAINT "shared_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_members" ADD CONSTRAINT "shared_members_group_id_shared_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shared_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_settlements" ADD CONSTRAINT "shared_settlements_group_id_shared_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shared_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_settlements" ADD CONSTRAINT "shared_settlements_group_from_fk" FOREIGN KEY ("group_id","from_id") REFERENCES "public"."shared_members"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_settlements" ADD CONSTRAINT "shared_settlements_group_to_fk" FOREIGN KEY ("group_id","to_id") REFERENCES "public"."shared_members"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_shares_group_expense_member_key" ON "shared_expense_shares" USING btree ("group_id","expense_id","member_id");--> statement-breakpoint
CREATE INDEX "shared_groups_owner_idx" ON "shared_groups" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_members_group_name_key" ON "shared_members" USING btree ("group_id",lower("name"));--> statement-breakpoint
CREATE INDEX "shared_settlements_group_idx" ON "shared_settlements" USING btree ("group_id");