import { and, eq, isNull } from "drizzle-orm";
import { sendNotification } from "web-push";
import { db } from "@/db";
import { inAppNotifications as notices, pushSubscriptions, telegramLinks, telegramPreferences, userNotificationPreferences } from "@/db/schema";
import { DEFAULT_NOTIFICATION_PREFERENCES, preferencesSchema, pushPayload, validPushEndpoint } from "./policy";
import type { NotificationDrivers } from "./dispatcher";

export const notificationDrivers: NotificationDrivers = {
  async preferences(userId) {
    const [row] = await db.select().from(userNotificationPreferences).where(eq(userNotificationPreferences.userId, userId)).limit(1);
    return row ? preferencesSchema.parse(Object.fromEntries(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).map(k => [k, row[k as keyof typeof row]]))) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  },
  async receipt(event) {
    const [created] = await db.insert(notices).values(event).onConflictDoNothing({ target: [notices.userId, notices.dedupeKey] }).returning({ id: notices.id });
    if (created) return created.id;
    const [row] = await db.select({ id: notices.id }).from(notices).where(and(eq(notices.userId, event.userId), eq(notices.dedupeKey, event.dedupeKey))).limit(1);
    if (!row) throw new Error("notification_receipt_failed");
    return row.id;
  },
  async in_app(event, id) {
    const rows = await db.update(notices).set({ visible: true }).where(and(eq(notices.userId, event.userId), eq(notices.id, id))).returning({ id: notices.id });
    return rows.length;
  },
  async push(event, id, prefs) {
    const [claim] = await db.update(notices).set({ pushClaimedAt: new Date() }).where(and(eq(notices.userId, event.userId), eq(notices.id, id), isNull(notices.pushClaimedAt))).returning({ id: notices.id });
    if (!claim) return 0;
    const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, event.userId));
    if (!subscriptions.length) return 0;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) throw new Error("push_unavailable");
    const results = await Promise.allSettled(subscriptions.map(async sub => {
      if (!validPushEndpoint(sub.endpoint)) throw new Error("push_endpoint_invalid");
      try {
        await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(pushPayload(event, prefs, id)), {
          vapidDetails: { subject: process.env.VAPID_SUBJECT ?? "mailto:suporte@mutano.app", publicKey, privateKey }, timeout: 5000, TTL: 3600,
        });
        return 1;
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, event.userId), eq(pushSubscriptions.id, sub.id), eq(pushSubscriptions.auth, sub.auth), eq(pushSubscriptions.p256dh, sub.p256dh)));
          return 0;
        }
        throw new Error("push_delivery_failed");
      }
    }));
    if (results.some(r => r.status === "rejected")) throw new Error("push_delivery_failed");
    return results.reduce((count, r) => count + (r.status === "fulfilled" ? r.value : 0), 0);
  },
  async telegram(event, id) {
    const [link] = await db.select({ chatId: telegramLinks.chatId, prefs: telegramPreferences }).from(telegramLinks)
      .innerJoin(telegramPreferences, eq(telegramPreferences.userId, telegramLinks.userId))
      .where(and(eq(telegramLinks.userId, event.userId), eq(telegramPreferences.enabled, true))).limit(1);
    if (!link || (event.category in link.prefs && link.prefs[event.category as keyof typeof link.prefs] === false)) return 0;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return 0;
    const [claim] = await db.update(notices).set({ telegramClaimedAt: new Date() }).where(and(eq(notices.userId, event.userId), eq(notices.id, id), isNull(notices.telegramClaimedAt))).returning({ id: notices.id });
    if (!claim) return 0;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: link.chatId, text: event.body, protect_content: true }) });
    const data: unknown = await response.json();
    if (!response.ok || !(data as { ok?: boolean })?.ok) throw new Error("telegram_delivery_failed");
    return 1;
  },
};
