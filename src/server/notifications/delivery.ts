import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { inAppNotifications as notices, pushSubscriptions, telegramLinks, telegramPreferences } from "@/db/schema";
import { getNowInSaoPaulo, todayRef } from "@/lib/dates";
import { deliverySlots, groupNotificationEvents, type ExternalChannel, type NotificationReceipt } from "./cadence";
import { isQuiet, type NotificationPreferences } from "./policy";
import { notificationDrivers } from "./drivers";

const noPending = new Error("no_pending_delivery");

/** One transaction serializes the daily quota and claims facts, before any external I/O. */
export async function reserveExternalDelivery(channel: ExternalChannel, receipts: NotificationReceipt[], now: Date, connection: Pick<typeof db, "transaction"> = db): Promise<NotificationReceipt[]> {
  if (!receipts.length) return [];
  const userId = receipts[0].event.userId;
  if (receipts.some(r => r.event.userId !== userId)) throw new Error("mixed_notification_owners");
  const day = todayRef(now);
  const claimedAt = channel === "push" ? notices.pushClaimedAt : notices.telegramClaimedAt;
  try {
    return await connection.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification:${userId}:${channel}:${day}`}))`);
      const pending = await tx.select({ id: notices.id }).from(notices).where(and(eq(notices.userId, userId),
        inArray(notices.id, receipts.map(r => r.id)), isNull(claimedAt))).orderBy(notices.id).for("update");
      if (!pending.length) return [];
      const byId = new Map(receipts.map(r => [r.id, r]));
      const eligible = pending.flatMap(r => byId.has(r.id) ? [byId.get(r.id)!] : []);
      let reserved = false;
      for (const slot of deliverySlots(eligible.some(r => r.event.critical))) {
        const [row] = await tx.insert(notices).values({ userId, category: "summary", type: "CHANNEL_QUOTA",
          body: "Reserva interna de entrega", actionUrl: "/notificacoes", visible: false,
          dedupeKey: `quota:${day}:${channel}:${slot}`, metadata: { channel, day, slot },
        }).onConflictDoNothing({ target: [notices.userId, notices.dedupeKey] }).returning({ id: notices.id });
        if (row) { reserved = true; break; }
      }
      if (!reserved) return [];
      const claimed = await tx.update(notices).set(channel === "push" ? { pushClaimedAt: now } : { telegramClaimedAt: now })
        .where(and(eq(notices.userId, userId), inArray(notices.id, eligible.map(r => r.id)), isNull(claimedAt)))
        .returning({ id: notices.id });
      if (!claimed.length) throw noPending; // rollback quota if another day/channel path already claimed the facts
      const ids = new Set(claimed.map(r => r.id));
      return eligible.filter(r => ids.has(r.id));
    });
  } catch (error) { if (error === noPending) return []; throw error; }
}

export async function deliverNotificationBatch(channel: ExternalChannel, receipts: NotificationReceipt[], _prefs: NotificationPreferences, now: Date) {
  if (!receipts.length) return 0;
  const userId = receipts[0].event.userId;
  const prefs = await notificationDrivers.preferences(userId);
  if (isQuiet(prefs, now) || !(channel === "push" ? prefs.channelPush : prefs.channelTelegram)) return 0;
  let eligible = receipts.filter(r => prefs[r.event.category] && r.event.category !== "negativeForecast");
  if (channel === "push") {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return 0;
    const subs = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1);
    if (!subs.length) return 0;
  } else {
    if (!process.env.TELEGRAM_BOT_TOKEN) return 0;
    const [link] = await db.select({ prefs: telegramPreferences }).from(telegramLinks)
      .innerJoin(telegramPreferences, eq(telegramPreferences.userId, telegramLinks.userId))
      .where(and(eq(telegramLinks.userId, userId), eq(telegramPreferences.enabled, true))).limit(1);
    const hour = getNowInSaoPaulo(now).getHours(), slot = hour >= 20 ? 20 : hour >= 14 ? 14 : 8;
    if (!link || hour < 8 || hour > 21 || !link.prefs.hours.includes(slot)) return 0;
    eligible = eligible.filter(r => !(r.event.category in link.prefs) || link.prefs[r.event.category as keyof typeof link.prefs] !== false);
  }
  const reserved = await reserveExternalDelivery(channel, eligible, now);
  if (!reserved.length) return 0;
  const grouped = groupNotificationEvents(reserved.map(r => r.event));
  return channel === "push" ? notificationDrivers.push(grouped, reserved[0].id, prefs, true)
    : notificationDrivers.telegram(grouped, reserved[0].id, true, now);
}
