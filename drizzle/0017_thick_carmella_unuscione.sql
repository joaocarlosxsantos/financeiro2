CREATE TABLE "open_finance_deleted" (
	"user_id" varchar(32) NOT NULL,
	"account_id" varchar(32) NOT NULL,
	"external_id" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "open_finance_deleted" ADD CONSTRAINT "open_finance_deleted_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_finance_deleted" ADD CONSTRAINT "open_finance_deleted_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "open_finance_deleted_identity_key" ON "open_finance_deleted" USING btree ("user_id","account_id","external_id");