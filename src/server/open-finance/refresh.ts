import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { openFinanceConnections, openFinanceRefreshLog } from "@/db/schema";
import { validWebhookSecret } from "@/server/telegram/protocol";
import { decryptSecret } from "./crypto";
import { patchPluggyItem, PluggyHttpError } from "./client";
import { decideRefresh, refreshReasonFor, REFRESH_MIN_INTERVAL_MS, saoPauloMonthStart, type RefreshDenial, type RefreshReason, type RefreshRecord } from "./refresh-budget";

/** Tempo que o cron matinal espera o webhook item/updated antes de seguir com o cache. */
export const MORNING_SYNC_WAIT_MS = 120_000;
const SYNC_POLL_MS = 5_000;
const HISTORY_LOOKBACK_MS = 24 * 3_600_000;

export type RefreshOutcome =
  | { ok: true; status: string }
  | { ok: false; denial: RefreshDenial | "DISABLED" | "IN_FLIGHT" }
  | { ok: false; error: string };

export interface RefreshDependencies {
  enabled(): boolean;
  /** Refreshes desde `since` (todas as conexões do usuário), com retryAfterAt persistido. */
  history(userId: string, since: Date): Promise<Array<RefreshRecord & { connectionId: string }>>;
  /** Grava a reserva ANTES de chamar a Pluggy e devolve o id da linha. */
  reserve(row: { userId: string; connectionId: string; reason: RefreshReason; at: Date }): Promise<string>;
  finish(logId: string, status: string, retryAfterAt?: Date | null): Promise<void>;
  apiKey(userId: string): Promise<string>;
  itemId(userId: string, connectionId: string): Promise<string>;
  patch(apiKey: string, itemId: string): Promise<{ status: string; executionStatus: string | null }>;
  connections(userId?: string): Promise<Array<{ userId: string; connectionId: string }>>;
  /** Espera lastSyncedAt >= since; devolve os ids que sincronizaram antes do prazo. */
  waitForSync(connectionIds: string[], since: Date, timeoutMs: number): Promise<string[]>;
}

/** Feature flag desligada por padrão: nada chama a Pluggy até o dono ligar OPEN_FINANCE_REFRESH_ENABLED=true. */
export const refreshEnabledFromEnv = () => process.env.OPEN_FINANCE_REFRESH_ENABLED === "true";

const inFlight = new Set<string>();

/** Retry-After da Pluggy; sem cabeçalho em 429, usa o intervalo mínimo. */
export function retryAfterFor(error: PluggyHttpError, now: Date): Date | null {
  if (error.status !== 429 && error.retryAfterSeconds === null) return null;
  const waitMs = error.retryAfterSeconds === null ? REFRESH_MIN_INTERVAL_MS : error.retryAfterSeconds * 1000;
  return new Date(now.getTime() + waitMs);
}

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
    const since = new Date(Math.min(saoPauloMonthStart(now).getTime(), now.getTime() - HISTORY_LOOKBACK_MS));
    const rows = await deps.history(input.userId, since);
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
      // Sem retry: a tentativa já consumiu cota. Retry-After fica persistido e vale para o app.
      const code = error instanceof PluggyHttpError ? `HTTP_${error.status}` : "ERROR";
      const retryAfterAt = error instanceof PluggyHttpError ? retryAfterFor(error, new Date()) : null;
      await deps.finish(logId, code, retryAfterAt).catch(() => {});
      return { ok: false, error: code };
    }
  } finally {
    inFlight.delete(input.connectionId);
  }
}

/** Cron agendado (8 horários SP, via GitHub Actions): refresh por conexão; no 06:30 espera o webhook. */
export async function handleScheduledRefreshCron(request: Request, deps: RefreshDependencies = defaultRefreshDependencies, now = new Date()) {
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
  if (!validWebhookSecret(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  if (!deps.enabled()) return Response.json({ skipped: "disabled" }, { headers });
  const counts = { ok: 0, denied: 0, failed: 0, synced: 0, pending: 0 };
  const started = now;
  const reason = refreshReasonFor(started);
  const refreshed: string[] = [];
  for (const row of await deps.connections()) {
    const outcome = await requestOpenFinanceRefresh({ ...row, reason }, deps);
    if (outcome.ok) { counts.ok++; if (reason === "morning") refreshed.push(row.connectionId); }
    else if ("error" in outcome) counts.failed++;
    else counts.denied++;
  }
  if (refreshed.length) {
    const synced = await deps.waitForSync(refreshed, started, MORNING_SYNC_WAIT_MS);
    counts.synced = synced.length;
    counts.pending = refreshed.length - synced.length;
  }
  return Response.json(counts, { headers });
}

export const defaultRefreshDependencies: RefreshDependencies = {
  enabled: refreshEnabledFromEnv,
  async history(userId, since) {
    const rows = await db
      .select({ connectionId: openFinanceRefreshLog.connectionId, at: openFinanceRefreshLog.createdAt, reason: openFinanceRefreshLog.reason, retryAfterAt: openFinanceRefreshLog.retryAfterAt })
      .from(openFinanceRefreshLog)
      .where(and(eq(openFinanceRefreshLog.userId, userId), gte(openFinanceRefreshLog.createdAt, since)));
    return rows.map((row) => ({ connectionId: row.connectionId, at: row.at, reason: row.reason as RefreshReason, retryAfterAt: row.retryAfterAt }));
  },
  async reserve(row) {
    const [inserted] = await db.insert(openFinanceRefreshLog)
      .values({ userId: row.userId, connectionId: row.connectionId, reason: row.reason, status: "PENDING", createdAt: row.at })
      .returning({ id: openFinanceRefreshLog.id });
    if (!inserted) throw new Error("REFRESH_RESERVE_FAILED");
    return inserted.id;
  },
  async finish(logId, status, retryAfterAt = null) {
    await db.update(openFinanceRefreshLog).set({ status, retryAfterAt }).where(eq(openFinanceRefreshLog.id, logId));
  },
  // Import dinâmico: sync puxa next-auth; só carregar quando o refresh realmente roda.
  apiKey: async (userId) => (await import("./sync")).resolvePluggyApiKey(userId),
  async itemId(userId, connectionId) {
    const [row] = await db.select({ envelope: openFinanceConnections.itemIdEnvelope }).from(openFinanceConnections)
      .where(and(eq(openFinanceConnections.id, connectionId), eq(openFinanceConnections.userId, userId))).limit(1);
    if (!row) throw new Error("CONNECTION_NOT_FOUND");
    return decryptSecret(row.envelope, userId, "itemId");
  },
  patch: (apiKey, itemId) => patchPluggyItem(apiKey, itemId),
  async connections(userId) {
    const rows = await db.select({ userId: openFinanceConnections.userId, connectionId: openFinanceConnections.id })
      .from(openFinanceConnections)
      .where(userId ? eq(openFinanceConnections.userId, userId) : undefined);
    return rows.map((row) => ({ userId: row.userId, connectionId: row.connectionId }));
  },
  async waitForSync(connectionIds, since, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    const done = new Set<string>();
    for (;;) {
      const pending = connectionIds.filter((id) => !done.has(id));
      const rows = await db.select({ id: openFinanceConnections.id, lastSyncedAt: openFinanceConnections.lastSyncedAt })
        .from(openFinanceConnections).where(inArray(openFinanceConnections.id, pending));
      for (const row of rows) if (row.lastSyncedAt && row.lastSyncedAt.getTime() >= since.getTime()) done.add(row.id);
      if (done.size === connectionIds.length || Date.now() + SYNC_POLL_MS > deadline) return [...done];
      await new Promise((resolve) => setTimeout(resolve, SYNC_POLL_MS));
    }
  },
};
