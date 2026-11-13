-- APLICADA em producao (Neon, banco do DIRECT_URL) em 2026-11-13, em transacao; nao integra o journal do Drizzle.
-- Necessaria antes de ligar OPEN_FINANCE_REFRESH_ENABLED=true (sem ela o refresh falha ao reservar cota).
-- Aplicar com autorizacao do dono; depois gerar migration numerada a partir do schema.

CREATE TABLE IF NOT EXISTS "open_finance_refresh_log" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"connection_id" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"retry_after_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "open_finance_refresh_log" ADD CONSTRAINT "open_finance_refresh_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_finance_refresh_log" ADD CONSTRAINT "open_finance_refresh_log_connection_id_open_finance_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."open_finance_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "open_finance_refresh_log_user_created_idx" ON "open_finance_refresh_log" USING btree ("user_id","created_at");
