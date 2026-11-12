import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions as subscriptions } from "@/db/schema";
import { boundedJson, notificationUser, privateHeaders as headers } from "@/server/notifications/http";
import { subscriptionSchema } from "@/server/notifications/policy";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const userId = await notificationUser(request, true); if (userId instanceof Response) return userId;
  try {
    const input = subscriptionSchema.parse(await boundedJson(request));
    const [existing] = await db.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.endpoint, input.endpoint)).limit(1);
    if (existing && existing.userId !== userId) return Response.json({ error: "Renove a inscrição deste dispositivo." }, { status: 409, headers });
    const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.userId, userId));
    if (!existing && Number(count?.total) >= 20) return Response.json({ error: "Limite de dispositivos atingido." }, { status: 429, headers });
    const rows = await db.insert(subscriptions).values({ userId, endpoint: input.endpoint, ...input.keys })
      .onConflictDoUpdate({ target: subscriptions.endpoint, set: { ...input.keys, updatedAt: new Date() }, setWhere: eq(subscriptions.userId, userId) }).returning({ id: subscriptions.id });
    if (!rows.length) return Response.json({ error: "Renove a inscrição deste dispositivo." }, { status: 409, headers });
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: "Inscrição inválida ou indisponível." }, { status: 400, headers }); }
}
export async function DELETE(request: Request) {
  const userId = await notificationUser(request, true); if (userId instanceof Response) return userId;
  try {
    const { endpoint } = z.object({ endpoint: z.string().max(2048) }).strict().parse(await boundedJson(request));
    await db.delete(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.endpoint, endpoint)));
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: "Inscrição inválida." }, { status: 400, headers }); }
}
