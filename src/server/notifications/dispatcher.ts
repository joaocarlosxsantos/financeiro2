import { eventSchema, isQuiet, type NotificationEvent, type NotificationPreferences } from "./policy";

export interface NotificationDrivers {
  preferences(userId: string): Promise<NotificationPreferences>;
  receipt(event: NotificationEvent): Promise<string>;
  in_app(event: NotificationEvent, id: string): Promise<number>;
  push(event: NotificationEvent, id: string, prefs: NotificationPreferences): Promise<number>;
  telegram(event: NotificationEvent, id: string): Promise<number>;
}
export class NotificationDispatcher {
  constructor(private drivers?: NotificationDrivers) {}
  async dispatch(input: unknown, now = new Date()) {
    const event = eventSchema.parse(input);
    const d = this.drivers ?? (await import("./drivers")).notificationDrivers;
    const prefs = await d.preferences(event.userId);
    const result: Record<"in_app" | "push" | "telegram", "sent" | "skipped" | "failed"> = { in_app: "skipped", push: "skipped", telegram: "skipped" };
    if (!prefs[event.category]) return result;
    const id = await d.receipt(event);
    const quiet = isQuiet(prefs, now);
    await Promise.allSettled(([
      ["in_app", prefs.channelInApp, () => d.in_app(event, id)],
      ["push", prefs.channelPush && !quiet, () => d.push(event, id, prefs)],
      ["telegram", prefs.channelTelegram && !quiet, () => d.telegram(event, id)],
    ] as const).map(async ([channel, enabled, send]) => {
      if (!enabled) return;
      try { result[channel] = await send() ? "sent" : "skipped"; } catch { result[channel] = "failed"; }
    }));
    return result;
  }
}
export const notificationDispatcher = new NotificationDispatcher();
