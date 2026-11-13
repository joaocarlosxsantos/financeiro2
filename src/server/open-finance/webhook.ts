import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { openFinanceConnections } from "@/db/schema";
import { secretFingerprint } from "./crypto";
import { syncOpenFinanceForUser } from "./sync";

export const MAX_PLUGGY_WEBHOOK_BODY_BYTES = 16_384;
/** Mesmo eventId pode ser entregue a várias URLs; evita sync repetido na mesma instância. */
const DEDUPE_TTL_MS = 10 * 60_000;
const DEDUPE_LIMIT = 500;

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

const seenEvents = new Map<string, number>();

function alreadyProcessed(eventId: string | undefined, now: number): boolean {
  for (const [key, at] of seenEvents) if (now - at > DEDUPE_TTL_MS) seenEvents.delete(key);
  return eventId ? seenEvents.has(eventId) : false;
}

function markProcessed(eventId: string | undefined, now: number) {
  if (!eventId) return;
  if (seenEvents.size >= DEDUPE_LIMIT) seenEvents.delete(seenEvents.keys().next().value!);
  seenEvents.set(eventId, now);
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
 * Recebe o webhook Pluggy `item/updated` autenticado por segredo (headers do
 * webhook configurado via POST /webhooks). Responde rápido e sincroniza depois,
 * sem pedir PATCH: o banco já liberou os dados novos.
 */
export async function handlePluggyWebhook(
  request: Request,
  secret: string | undefined,
  overrides: Partial<PluggyWebhookDependencies> = {},
) {
  const deps: PluggyWebhookDependencies = { ...dependencies, ...overrides };
  const headers = { "Cache-Control": "no-store" };
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
  if (!validPluggyWebhookSecret(request.headers.get("x-webhook-secret"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await boundedBody(request));
  } catch (error) {
    return Response.json({ error: "invalid_request" }, { status: error instanceof RangeError ? 413 : 400, headers });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });

  if (parsed.data.event !== "item/updated") {
    return Response.json({ ok: true, ignored: true }, { status: 200, headers });
  }
  if (!parsed.data.itemId) return Response.json({ error: "invalid_request" }, { status: 400, headers });

  const now = Date.now();
  if (alreadyProcessed(parsed.data.eventId, now)) {
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

  markProcessed(parsed.data.eventId, now);
  deps.schedule(async () => {
    try {
      const result = await syncOpenFinanceForUser(connection!.userId, connection!.id, "webhook", { skipItemUpdate: true });
      console.info("[pluggy-webhook]", { event: parsed.data.event, status: result.status });
    } catch (error) {
      console.error("[pluggy-webhook]", { event: parsed.data.event, status: "sync_failed", code: error instanceof Error ? error.name : "UNKNOWN" });
    }
  });
  return Response.json({ ok: true }, { status: 202, headers });
}
