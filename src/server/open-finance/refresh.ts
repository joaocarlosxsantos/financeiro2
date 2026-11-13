import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { openFinanceConnections, openFinanceRefreshLog } from "@/db/schema";
import { validWebhookSecret } from "@/server/telegram/protocol";
import { decryptSecret } from "./crypto";
import { patchPluggyItem, PluggyHttpError } from "./client";
import { decideRefresh, saoPauloMonthStart, type RefreshDenial, type RefreshReason, type RefreshRecord } from "./refresh-budget";
import { resolvePluggyApiKey } from "./sync";

export type RefreshOutcome =
  | { ok: true; status: string }
  | { ok: false; denial: RefreshDenial | "DISABLED" | "IN_FLIGHT" }
  | { ok: false; error: string };

export interface RefreshDependencies {
  enabled(): boolean;
  /** Refreshes do usuário desde `since` (todas as conexões). */
  history(userId: string, since: Date): Promise<Array<RefreshRecord & { connectionId: string }>>;
  /** Grava a reserva ANTES de chamar a Pluggy e devolve o id da linha. */
  reserve(row: { userId: string; connectionId: string; reason: RefreshReason; at: Date }): Promise<string>;
  finish(logId: string, status: string): Promise<void>;
  apiKey(userId: string): Promise<string>;
  itemId(userId: string, connectionId: string): Promise<string>;
  patch(apiKey: string, itemId: string): Promise<{ status: string; executionStatus: string | null }>;
  connections(): Promise<Array<{ userId: string; connectionId: string }>>;
}

/** Feature flag desligada por padrão: nada chama a Pluggy até o dono ligar OPEN_FINANCE_REFRESH_ENABLED=true. */
export const refreshEnabledFromEnv = () => process.env.OPEN_FINANCE_REFRESH_ENABLED === "true";

const inFlight = new Set<string>();

/** Single-flight por item nesta instância; o orçamento persistido é o limite real entre instâncias. */
export async function requestOpenFinanceRefresh(
  input: { userId: string; connectionId: string; reason: RefreshReason },
  deps: RefreshDependencies,
  now = new Date(),
): Promise<RefreshOutcome> {
  if (!deps.enabled()) return { ok: false, denial: "DISABLED" };
  if (inFlight.has(input.connectionId)) return { ok: false, denial: "IN_FLIGHT" };
  inFlight.add(input.connectionId);
  try {
    const rows = await deps.history(input.userId, saoPauloMonthStart(now));
    const decision = decideRefresh({
      now,
      reason: input.reason,
      item: rows.filter((row) => row.connectionId === input.connectionId),
      all: rows,
    });
    if (!decision.allowed) return { ok: false, denial: decision.denial };

    const logId = await deps.reserve({ ...input, at: now });
    try {
      const apiKey = await deps.apiKey(input.userId);
      const itemId = await deps.itemId(input.userId, input.connectionId);
      const result = await deps.patch(apiKey, itemId);
      await deps.finish(logId, "OK");
      return { ok: true, status: result.status };
    } catch (error) {
      // 429/423/PARTIAL_SUCCESS e falhas: sem retry; a tentativa já consumiu cota.
      const code = error instanceof PluggyHttpError ? `HTTP_${error.status}` : "ERROR";
      await deps.finish(logId, code).catch(() => {});
      return { ok: false, error: code };
    }
  } finally {
    inFlight.delete(input.connectionId);
  }
}

/** Cron diário (06:30 São Paulo = 09:30 UTC): um refresh matinal por conexão. */
export async function handleMorningRefreshCron(request: Request, deps: RefreshDependencies = defaultRefreshDependencies) {
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
  if (!validWebhookSecret(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  if (!deps.enabled()) return Response.json({ skipped: "disabled" }, { headers });
  const counts = { ok: 0, denied: 0, failed: 0 };
  for (const row of await deps.connections()) {
    const outcome = await requestOpenFinanceRefresh({ ...row, reason: "morning" }, deps);
    if (outcome.ok) counts.ok++;
    else if ("error" in outcome) counts.failed++;
    else counts.denied++;
  }
  return Response.json(counts, { headers });
}

const defaultRefreshDependencies: RefreshDependencies = {
  enabled: refreshEnabledFromEnv,
  async history(userId, since) {
    const rows = await db
      .select({ connectionId: openFinanceRefreshLog.connectionId, at: openFinanceRefreshLog.createdAt, reason: openFinanceRefreshLog.reason })
      .from(openFinanceRefreshLog)
      .where(and(eq(openFinanceRefreshLog.userId, userId), gte(openFinanceRefreshLog.createdAt, since)));
    return rows.map((row) => ({ connectionId: row.connectionId, at: row.at, reason: row.reason as RefreshReason }));
  },
  async reserve(row) {
    const [inserted] = await db.insert(openFinanceRefreshLog)
      .values({ userId: row.userId, connectionId: row.connectionId, reason: row.reason, status: "PENDING", createdAt: row.at })
      .returning({ id: openFinanceRefreshLog.id });
    if (!inserted) throw new Error("REFRESH_RESERVE_FAILED");
    return inserted.id;
  },
  async finish(logId, status) {
    await db.update(openFinanceRefreshLog).set({ status }).where(eq(openFinanceRefreshLog.id, logId));
  },
  apiKey: (userId) => resolvePluggyApiKey(userId),
  async itemId(userId, connectionId) {
    const [row] = await db.select({ envelope: openFinanceConnections.itemIdEnvelope }).from(openFinanceConnections)
      .where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
    if (!row) throw new Error("CONNECTION_NOT_FOUND");
    return decryptSecret(row.envelope, userId, "itemId");
  },
  patch: (apiKey, itemId) => patchPluggyItem(apiKey, itemId),
  async connections() {
    const rows = await db.select({ userId: openFinanceConnections.userId, connectionId: openFinanceConnections.id }).from(openFinanceConnections);
    return rows.map((row) => ({ userId: row.userId, connectionId: row.connectionId }));
  },
};
