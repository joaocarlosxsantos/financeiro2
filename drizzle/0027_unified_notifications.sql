CREATE TABLE "in_app_notifications" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"category" varchar(32) NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(150) DEFAULT 'Mutano Contas' NOT NULL,
	"body" text NOT NULL,
	"action_url" text DEFAULT '/notificacoes' NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"push_claimed_at" timestamp with time zone,
	"telegram_claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_in_app" boolean DEFAULT true NOT NULL,
	"channel_push" boolean DEFAULT true NOT NULL,
	"channel_telegram" boolean DEFAULT true NOT NULL,
	"due_bills" boolean DEFAULT true NOT NULL,
	"budget" boolean DEFAULT true NOT NULL,
	"card_invoice" boolean DEFAULT true NOT NULL,
	"negative_forecast" boolean DEFAULT true NOT NULL,
	"spending" boolean DEFAULT true NOT NULL,
	"summary" boolean DEFAULT true NOT NULL,
	"sync_alerts" boolean DEFAULT true NOT NULL,
	"goals" boolean DEFAULT true NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT true NOT NULL,
	"quiet_start_hour" integer DEFAULT 22 NOT NULL,
	"quiet_end_hour" integer DEFAULT 8 NOT NULL,
	"discrete_push_mode" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_quiet_hours_chk" CHECK ("user_notification_preferences"."quiet_start_hour" between 0 and 23 and "user_notification_preferences"."quiet_end_hour" between 0 and 23)
);
--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "in_app_notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "in_app_notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");