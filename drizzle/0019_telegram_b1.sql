CREATE TABLE "telegram_chat_state" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"last_update_id" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "telegram_link_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_links_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;