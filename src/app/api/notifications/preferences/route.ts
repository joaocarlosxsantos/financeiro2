import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userNotificationPreferences, telegramLinks, telegramPreferences } from "@/db/schema";
import { boundedJson, notificationUser, privateHeaders as headers } from "@/server/notifications/http";
import { preferencesSchema } from "@/server/notifications/policy";
import { notificationDrivers } from "@/server/notifications/drivers";
export async function GET(request: Request) {
  const userId = await notificationUser(request); if (userId instanceof Response) return userId;
  const [prefs, links] = await Promise.all([notificationDrivers.preferences(userId), db.select({ userId: telegramLinks.userId }).from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1)]);
  return Response.json({ prefs, telegramLinked: links.length > 0 }, { headers });
}
export async function POST(request: Request) {
  const userId = await notificationUser(request, true); if (userId instanceof Response) return userId;
  try {
    const prefs = preferencesSchema.parse(await boundedJson(request));
    if (prefs.channelTelegram && !(await db.select({ userId: telegramLinks.userId }).from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1)).length)
      return Response.json({ error: "Vincule o Telegram em Configurações antes de ativar esse canal." }, { status: 400, headers });
    await db.transaction(async tx => {
      await tx.insert(userNotificationPreferences).values({ userId, ...prefs }).onConflictDoUpdate({ target: userNotificationPreferences.userId, set: { ...prefs, updatedAt: new Date() } });
      const { summary, spending, dueBills, budget, cardInvoice, negativeForecast } = prefs;
      const legacy = { summary, spending, dueBills, budget, cardInvoice, negativeForecast, enabled: prefs.channelTelegram };
      await tx.insert(telegramPreferences).values({ userId, ...legacy }).onConflictDoUpdate({ target: telegramPreferences.userId, set: { ...legacy, updatedAt: new Date() } });
    });
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: "Preferências inválidas ou indisponíveis." }, { status: 400, headers }); }
}
