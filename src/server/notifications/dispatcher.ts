import { eventSchema, isQuiet, type NotificationEvent, type NotificationPreferences } from "./policy";
import { groupNotificationEvents, type ExternalChannel, type NotificationReceipt } from "./cadence";

export interface NotificationDrivers {
  preferences(userId: string): Promise<NotificationPreferences>;
  receipt(event: NotificationEvent): Promise<string>;
  in_app(event: NotificationEvent, id: string): Promise<number>;
  push(event: NotificationEvent, id: string, prefs: NotificationPreferences, reserved?: boolean): Promise<number>;
  telegram(event: NotificationEvent, id: string, reserved?: boolean, now?: Date): Promise<number>;
  batch?(channel: ExternalChannel, receipts: NotificationReceipt[], prefs: NotificationPreferences, now: Date): Promise<number>;
}
export class NotificationDispatcher {
  constructor(private drivers?: NotificationDrivers) {}
  async dispatch(input: unknown, now = new Date()) {
    return this.dispatchBatch([input], now);
  }
  async dispatchBatch(input: unknown[], now = new Date()) {
    const events = input.map(value => eventSchema.parse(value));
    const result: Record<"in_app" | "push" | "telegram", "sent" | "skipped" | "failed"> = { in_app: "skipped", push: "skipped", telegram: "skipped" };
    if (!events.length) return result;
    if (events.some(e => e.userId !== events[0].userId)) throw new Error("mixed_notification_owners");
    const d = this.drivers ?? (await import("./drivers")).notificationDrivers;
    const prefs = await d.preferences(events[0].userId);
    const eligible = events.filter(e => prefs[e.category]);
    if (!eligible.length) return result;
    const receipts = await Promise.all(eligible.map(async event => ({ event, id: await d.receipt(event) })));
    const quiet = isQuiet(prefs, now);
    // Standalone balance/forecast alerts no longer interrupt: the daily summary owns those metrics.
    const external = receipts.filter(r => r.event.category !== "negativeForecast");
    const send = (channel: ExternalChannel) => !external.length ? Promise.resolve(0) : d.batch ? d.batch(channel, external, prefs, now)
      : channel === "push" ? d.push(groupNotificationEvents(external.map(r => r.event)), external[0].id, prefs)
        : d.telegram(groupNotificationEvents(external.map(r => r.event)), external[0].id);
    await Promise.allSettled(([
      ["in_app", prefs.channelInApp, async () => (await Promise.all(receipts.map(r => d.in_app(r.event, r.id)))).reduce((a, b) => a + b, 0)],
      ["push", prefs.channelPush && !quiet, () => send("push")],
      ["telegram", prefs.channelTelegram && !quiet, () => send("telegram")],
    ] as const).map(async ([channel, enabled, deliver]) => {
      if (!enabled) return;
      try { result[channel] = await deliver() ? "sent" : "skipped"; } catch { result[channel] = "failed"; }
    }));
    return result;
  }
}
export const notificationDispatcher = new NotificationDispatcher();
