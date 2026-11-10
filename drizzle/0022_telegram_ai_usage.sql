CREATE TABLE "telegram_ai_usage" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"day" varchar(10) NOT NULL,
	"day_count" integer NOT NULL,
	"minute_started_at" timestamp with time zone NOT NULL,
	"minute_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_ai_usage" ADD CONSTRAINT "telegram_ai_usage_chat_id_telegram_chat_state_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chat_state"("chat_id") ON DELETE cascade ON UPDATE no action;