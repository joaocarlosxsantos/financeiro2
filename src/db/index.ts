import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não definida. Copie .env.example para .env e preencha.");
}

const globalForDb = globalThis as unknown as { client?: ReturnType<typeof postgres> };

/**
 * Uma única conexão por processo. Em serverless (Vercel) o pool fica pequeno
 * de propósito — use a connection string com pooling do seu provedor.
 */
const client =
  globalForDb.client ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 5 : 2,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
export { schema };
