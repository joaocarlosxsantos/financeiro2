-- APLICADA em producao em 2026-11-13. Tabela ORFA: codigo de refresh removido (fase 4, sem uso).
-- NAO dropar automaticamente. drizzle-kit generate vai propor DROP TABLE: recusar ou dropar manualmente com autorizacao do dono.
-- Conteudo original abaixo (referencia).

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
