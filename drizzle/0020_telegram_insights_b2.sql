CREATE TABLE "telegram_deliveries" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"window_key" varchar(13) NOT NULL,
	"status" text DEFAULT 'CLAIMED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_deliveries_status_chk" CHECK ("telegram_deliveries"."status" in ('CLAIMED', 'SENT', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "telegram_preferences" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"hours" integer[] DEFAULT '{8,14,20}' NOT NULL,
	"summary" boolean DEFAULT true NOT NULL,
	"spending" boolean DEFAULT true NOT NULL,
	"due_bills" boolean DEFAULT true NOT NULL,
	"budget" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_preferences_hours_chk" CHECK (cardinality("telegram_preferences"."hours") between 1 and 3 and "telegram_preferences"."hours" <@ ARRAY[8,14,20]::integer[])
);
--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_preferences" ADD CONSTRAINT "telegram_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_deliveries_user_window_key" ON "telegram_deliveries" USING btree ("user_id","window_key");