import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { inAppNotifications as notices } from "@/db/schema";
import { boundedJson, notificationUser, privateHeaders as headers } from "@/server/notifications/http";
import { actionUrls } from "@/server/notifications/policy";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = await notificationUser(request); if (userId instanceof Response) return userId;
  const query = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), filter: z.enum(["all", "unread", "critical"]).default("all") }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return Response.json({ error: "Filtro inválido." }, { status: 400, headers });
  const own = and(eq(notices.userId, userId), eq(notices.visible, true), isNull(notices.archivedAt));
  const [rows, [count]] = await Promise.all([
    db.select({ id: notices.id, body: notices.body, title: notices.title, actionUrl: notices.actionUrl, critical: notices.critical, readAt: notices.readAt, createdAt: notices.createdAt }).from(notices)
      .where(and(own, query.data.filter === "unread" ? isNull(notices.readAt) : undefined, query.data.filter === "critical" ? eq(notices.critical, true) : undefined))
      .orderBy(desc(notices.createdAt), desc(notices.id)).limit(21).offset((query.data.page - 1) * 20),
    db.select({ total: sql<number>`count(*)::int` }).from(notices).where(and(own, isNull(notices.readAt))),
  ]);
  return Response.json({ items: rows.slice(0, 20).map(r => ({ ...r, actionUrl: actionUrls.includes(r.actionUrl as typeof actionUrls[number]) ? r.actionUrl : "/notificacoes" })), unreadCount: Number(count?.total ?? 0), hasMore: rows.length > 20 }, { headers });
}
const mutation = z.object({ action: z.enum(["read", "archive", "read_all"]), id: z.string().min(1).max(32).optional() }).strict().refine(v => v.action === "read_all" ? !v.id : Boolean(v.id));
export async function POST(request: Request) {
  const userId = await notificationUser(request, true); if (userId instanceof Response) return userId;
  try {
    const input = mutation.safeParse(await boundedJson(request)); if (!input.success) throw new Error("input");
    const { action, id } = input.data;
    const rows = await db.update(notices).set(action === "archive" ? { archivedAt: new Date() } : { readAt: new Date() })
      .where(and(eq(notices.userId, userId), eq(notices.visible, true), action === "read_all" ? isNull(notices.readAt) : eq(notices.id, id!))).returning({ id: notices.id });
    if (action !== "read_all" && !rows.length) return Response.json({ error: "Notificação não encontrada." }, { status: 404, headers });
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: "Não foi possível atualizar a notificação." }, { status: 400, headers }); }
}
