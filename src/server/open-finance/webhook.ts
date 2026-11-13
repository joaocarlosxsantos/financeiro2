import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { openFinanceConnections } from "@/db/schema";
import { secretFingerprint } from "./crypto";
import { syncOpenFinanceForUser } from "./sync";
import { notificationDispatcher } from "@/server/notifications/dispatcher";

export const MAX_PLUGGY_WEBHOOK_BODY_BYTES = 16_384;
/** Mesmo eventId pode ser entregue a várias URLs; evita sync repetido na mesma instância. */
const DEDUPE_TTL_MS = 10 * 60_000;
const DEDUPE_LIMIT = 500;
/** Eventos que indicam dado novo no banco; os demais são ignorados (200). */
const SYNC_EVENTS = new Set(["item/updated", "transactions/created"]);

const payloadSchema = z.object({
  event: z.string().min(1).max(80),
  eventId: z.string().min(1).max(200).optional(),
  itemId: z.string().min(1).max(100).optional(),
  clientUserId: z.string().min(1).max(200).nullable().optional(),
});

export type PluggyWebhookConnection = { id: string; userId: string };

export type PluggyWebhookDependencies = {
  findConnection(itemId: string, clientUserId: string | null): Promise<PluggyWebhookConnection | null>;
  schedule(task: () => Promise<void>): void;
};

export function validPluggyWebhookSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Painel Pluggy não aceita header: o segredo também vem em ?secret=. Header tem precedência. */
export function presentedPluggyWebhookSecret(request: Request): string | null {
  const header = request.headers.get("x-webhook-secret");
  if (header !== null) return header;
  return new URL(request.url).searchParams.get("secret");
}

/** Chave estável por entrega: eventId quando existe, senão hash do corpo (retentativas idênticas). */
export function webhookEventKey(event: string, itemId: string, eventId: string | undefined, rawBody: string): string {
  const id = eventId ?? `body:${createHash("sha256").update(rawBody).digest("hex")}`;
  return `${event}|${itemId}|${id}`;
}

const seenEvents = new Map<string, number>();

function alreadyProcessed(key: string, now: number): boolean {
  for (const [known, at] of seenEvents) if (now - at > DEDUPE_TTL_MS) seenEvents.delete(known);
  return seenEvents.has(key);
}

function markProcessed(key: string, now: number) {
  if (seenEvents.size >= DEDUPE_LIMIT) seenEvents.delete(seenEvents.keys().next().value!);
  seenEvents.set(key, now);
}

/** Limite real sobre o stream: Content-Length pode estar ausente ou mentir. */
async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_PLUGGY_WEBHOOK_BODY_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PLUGGY_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

const dependencies: PluggyWebhookDependencies = {
  async findConnection(itemId, clientUserId) {
    const itemIdHash = secretFingerprint(itemId);
    const [row] = await db
      .select({ id: openFinanceConnections.id, userId: openFinanceConnections.userId })
      .from(openFinanceConnections)
      .where(and(
        eq(openFinanceConnections.itemIdHash, itemIdHash),
        clientUserId ? eq(openFinanceConnections.userId, clientUserId) : undefined,
      ))
      .limit(1);
    return row ?? null;
  },
  schedule(task) {
    void task;
    throw new Error("PLUGGY_WEBHOOK_SCHEDULER_MISSING");
  },
};

/**
 * Recebe webhooks Pluggy (item/updated, transactions/created) autenticados por segredo
 * (header x-webhook-secret ou ?secret=). Responde rápido e sincroniza depois.
 */
export async function handlePluggyWebhook(
  request: Request,
  secret: string | undefined,
  overrides: Partial<PluggyWebhookDependencies> = {},
) {
  const deps: PluggyWebhookDependencies = { ...dependencies, ...overrides };
  const headers = { "Cache-Control": "no-store" };
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
  if (!validPluggyWebhookSecret(presentedPluggyWebhookSecret(request), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }

  let rawBody: string;
  let raw: unknown;
  try {
    rawBody = await boundedBody(request);
    raw = JSON.parse(rawBody);
  } catch (error) {
    return Response.json({ error: "invalid_request" }, { status: error instanceof RangeError ? 413 : 400, headers });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });

  if (!SYNC_EVENTS.has(parsed.data.event)) {
    return Response.json({ ok: true, ignored: true }, { status: 200, headers });
  }
  if (!parsed.data.itemId) return Response.json({ error: "invalid_request" }, { status: 400, headers });

  const now = Date.now();
  const eventKey = webhookEventKey(parsed.data.event, parsed.data.itemId, parsed.data.eventId, rawBody);
  if (alreadyProcessed(eventKey, now)) {
    return Response.json({ ok: true, duplicate: true }, { status: 200, headers });
  }

  let connection: PluggyWebhookConnection | null;
  try {
    connection = await deps.findConnection(parsed.data.itemId, parsed.data.clientUserId ?? null);
  } catch {
    console.error("[pluggy-webhook]", { event: parsed.data.event, status: "lookup_failed" });
    return Response.json({ error: "unavailable" }, { status: 500, headers });
  }
  if (!connection) {
    console.info("[pluggy-webhook]", { event: parsed.data.event, status: "item_unknown" });
    return Response.json({ ok: true, ignored: true }, { status: 200, headers });
  }

  markProcessed(eventKey, now);
  const found = connection;
  const notifyKey = createHash("sha256").update(`${found.id}|${eventKey}`).digest("hex").slice(0, 40);
  deps.schedule(async () => {
    try {
      const result = await syncOpenFinanceForUser(found.userId, found.id, "webhook");
      console.info("[pluggy-webhook]", { event: parsed.data.event, status: result.status });
      if ("ok" in result && result.ok && result.imported > 0) {
        const imported = result.imported;
        await notificationDispatcher.dispatch({
          userId: found.userId,
          category: "syncAlerts",
          type: "pluggy_sync_updated",
          body: `Dados atualizados: ${imported} nova${imported === 1 ? "" : "s"} transaç${imported === 1 ? "ão" : "ões"}`,
          actionUrl: "/configuracoes/integracao",
          dedupeKey: `pluggy_sync_${notifyKey}`,
        });
      }
    } catch (error) {
      console.error("[pluggy-webhook]", { event: parsed.data.event, status: "sync_failed", code: error instanceof Error ? error.name : "UNKNOWN" });
    }
  });
  return Response.json({ ok: true }, { status: 202, headers });
}
