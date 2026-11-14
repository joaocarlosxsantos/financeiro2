import { validWebhookSecret } from "@/server/telegram/protocol";
import { getNowInSaoPaulo, monthRefToParam, shiftMonth, currentMonthRef, todayRef } from "@/lib/dates";
import type { NotificationEvent } from "./policy";
export type NotificationCronMode = "daily" | "insights" | "monthly" | "alerts";
export interface NotificationCronDependencies {
  users(after?: string): Promise<{ id: string }[]>;
  events(userId: string, mode: NotificationCronMode, now: Date): Promise<NotificationEvent[]>;
  dispatch(event: NotificationEvent, now: Date): Promise<Record<string, string>>;
  dispatchBatch?(events: NotificationEvent[], now: Date): Promise<Record<string, string>>;
}
export function notificationWindow(mode: NotificationCronMode, now: Date) {
  const local = getNowInSaoPaulo(now), hour = local.getHours();
  if (hour < 8 || hour > 21 || (mode === "monthly" && local.getDate() !== 1)) return null;
  if ((mode === "daily" || mode === "monthly") && hour !== 8) return null;
  // Monthly replaces the morning daily/weekly delivery on the first, including Mondays.
  if (mode === "daily" && local.getDate() === 1) return null;
  if (mode === "insights" && hour < 14) return null;
  const day = todayRef(now);
  return mode === "daily" ? `${day}:ds` : mode === "monthly" ? `${monthRefToParam(shiftMonth(currentMonthRef(now), -1))}:month`
    : mode === "alerts" ? `${day}:alerts` : `${day}:${hour >= 20 ? 20 : hour >= 14 ? 14 : 8}`;
}
export async function handleNotificationCron(request: Request, mode: NotificationCronMode, deps?: NotificationCronDependencies, now = new Date()) {
  const headers = { "Cache-Control": "no-store" }, secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
  if (!validWebhookSecret(request.headers.get("authorization"), `Bearer ${secret}`)) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (!notificationWindow(mode, now)) return Response.json({ sent: 0, skipped: 0, failed: 0 }, { headers });
  const d = deps ?? (await import("./cron-data")).notificationCronDependencies;
  const result = { sent: 0, skipped: 0, failed: 0 }, deadline = Date.now() + 240000;
  let after: string | undefined;
  try {
    while (true) {
      const rows = await d.users(after);
      for (let i = 0; i < rows.length; i += 3) {
        if (Date.now() >= deadline) return Response.json({ ...result, remaining: true }, { headers });
        await Promise.allSettled(rows.slice(i, i + 3).map(async user => {
          try {
            const events = await d.events(user.id, mode, now);
            if (!events.length) result.skipped++;
            const batches = d.dispatchBatch ? [events] : events.map(event => [event]);
            for (const batch of batches) {
              const channels = Object.values(d.dispatchBatch ? await d.dispatchBatch(batch, now) : await d.dispatch(batch[0], now));
              if (channels.includes("sent")) result.sent++;
              else if (channels.includes("failed")) result.failed++;
              else result.skipped++;
            }
          } catch { result.failed++; }
        }));
      }
      if (rows.length < 100) break;
      after = rows[rows.length - 1].id;
    }
    return Response.json(result, { headers });
  } catch { return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers }); }
}
