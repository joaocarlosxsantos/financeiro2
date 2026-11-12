CREATE TABLE IF NOT EXISTS "telegram_transaction_drafts" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"chat_id" text NOT NULL,
	"link_created_at" timestamp with time zone NOT NULL,
	"source_update_id" integer NOT NULL,
	"account_id" varchar(32),
	"category_id" varchar(32),
	"description" varchar(255) NOT NULL,
	"amount_cents" integer NOT NULL,
	"transaction_date" date NOT NULL,
	"kind" "category_kind" DEFAULT 'EXPENSE' NOT NULL,
	"nature" "expense_nature" DEFAULT 'VARIABLE' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"transaction_id" varchar(32),
	"confirmed_payload_hash" varchar(64),
	"expires_at" timestamp with time zone DEFAULT (now() + interval '10 minutes') NOT NULL,
	"confirmed_at" timestamp with time zone,
	"undo_until" timestamp with time zone,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_drafts_source_key" UNIQUE("user_id","chat_id","link_created_at","source_update_id"),
	CONSTRAINT "telegram_drafts_amount_chk" CHECK ("telegram_transaction_drafts"."amount_cents" between 1 and 2000000000),
	CONSTRAINT "telegram_drafts_description_chk" CHECK (char_length(btrim("telegram_transaction_drafts"."description")) between 2 and 255 and "telegram_transaction_drafts"."description" !~ '[[:cntrl:]]'),
	CONSTRAINT "telegram_drafts_chat_chk" CHECK ("telegram_transaction_drafts"."chat_id" ~ '^[1-9][0-9]{0,15}$'),
	CONSTRAINT "telegram_drafts_update_chk" CHECK ("telegram_transaction_drafts"."source_update_id" between 0 and 2147483647),
	CONSTRAINT "telegram_drafts_expiry_chk" CHECK ("telegram_transaction_drafts"."expires_at" > "telegram_transaction_drafts"."created_at"),
	CONSTRAINT "telegram_drafts_hash_chk" CHECK ("telegram_transaction_drafts"."confirmed_payload_hash" is null or "telegram_transaction_drafts"."confirmed_payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "telegram_drafts_state_chk" CHECK (
      ("telegram_transaction_drafts"."status" in ('PENDING', 'CANCELLED', 'EXPIRED')
        and "telegram_transaction_drafts"."transaction_id" is null and "telegram_transaction_drafts"."confirmed_payload_hash" is null
        and "telegram_transaction_drafts"."confirmed_at" is null and "telegram_transaction_drafts"."undo_until" is null and "telegram_transaction_drafts"."undone_at" is null)
      or
      ("telegram_transaction_drafts"."status" = 'CONFIRMED'
        and "telegram_transaction_drafts"."transaction_id" is not null and "telegram_transaction_drafts"."confirmed_payload_hash" is not null
        and "telegram_transaction_drafts"."confirmed_at" is not null and "telegram_transaction_drafts"."undo_until" is not null and "telegram_transaction_drafts"."undo_until" > "telegram_transaction_drafts"."confirmed_at"
        and "telegram_transaction_drafts"."undone_at" is null)
      or
      ("telegram_transaction_drafts"."status" = 'UNDONE'
        and "telegram_transaction_drafts"."transaction_id" is not null and "telegram_transaction_drafts"."confirmed_payload_hash" is not null
        and "telegram_transaction_drafts"."confirmed_at" is not null and "telegram_transaction_drafts"."undo_until" is not null and "telegram_transaction_drafts"."undo_until" > "telegram_transaction_drafts"."confirmed_at"
        and "telegram_transaction_drafts"."undone_at" is not null and "telegram_transaction_drafts"."undone_at" >= "telegram_transaction_drafts"."confirmed_at")
    )
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_transaction_drafts" ADD CONSTRAINT "telegram_transaction_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_transaction_drafts" ADD CONSTRAINT "telegram_transaction_drafts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_transaction_drafts" ADD CONSTRAINT "telegram_transaction_drafts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_drafts_owner_status_expiry_idx" ON "telegram_transaction_drafts" USING btree ("user_id","status","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_drafts_transaction_key" ON "telegram_transaction_drafts" USING btree ("user_id","transaction_id") WHERE "telegram_transaction_drafts"."transaction_id" is not null;
