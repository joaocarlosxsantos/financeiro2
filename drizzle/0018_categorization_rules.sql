CREATE TABLE "category_rules" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"normalized_pattern" text NOT NULL,
	"category_id" varchar(32) NOT NULL,
	"source" text DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_rules_source_chk" CHECK ("category_rules"."source" in ('USER', 'AI'))
);
--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_rules_user_pattern_key" ON "category_rules" USING btree ("user_id","normalized_pattern");--> statement-breakpoint
CREATE INDEX "category_rules_user_idx" ON "category_rules" USING btree ("user_id");