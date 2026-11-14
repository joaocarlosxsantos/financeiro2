import { createHash } from "node:crypto";
import { eventSchema, type NotificationEvent } from "./policy";

/** Per owner/channel/civil day. One slot is protected for urgent due bills/cards. */
export const MAX_EXTERNAL_DELIVERIES_PER_DAY = 3;
export const RESERVED_URGENT_DELIVERIES = 1;
export type ExternalChannel = "push" | "telegram";
export type NotificationReceipt = { event: NotificationEvent; id: string };

export function deliverySlots(urgent: boolean) {
  const ordinary = Array.from({ length: Math.max(0, MAX_EXTERNAL_DELIVERIES_PER_DAY - RESERVED_URGENT_DELIVERIES) }, (_, i) => i);
  const reserved = Array.from({ length: Math.min(RESERVED_URGENT_DELIVERIES, MAX_EXTERNAL_DELIVERIES_PER_DAY) }, (_, i) => MAX_EXTERNAL_DELIVERIES_PER_DAY - i - 1);
  return urgent ? [...reserved, ...ordinary] : ordinary;
}

/** Called only after channel/category opt-outs; details remain as individual in-app receipts. */
export function groupNotificationEvents(events: NotificationEvent[]) {
  if (!events.length) throw new Error("empty_notification_group");
  const sorted = [...events].sort((a, b) => Number(b.critical) - Number(a.critical));
  const owner = sorted[0].userId;
  if (sorted.some(e => e.userId !== owner)) throw new Error("mixed_notification_owners");
  const lines: string[] = [];
  let length = 0;
  for (const event of sorted) {
    if (!lines.length && event.body.length > 3550) { lines.push(`${event.body.slice(0, 3500)}\nDetalhes completos no app.`); break; }
    if (length + event.body.length > 3550) break;
    lines.push(event.body); length += event.body.length + 1;
  }
  if (lines.length < sorted.length) lines.push(`Mais ${sorted.length - lines.length} avisos na caixa do app.`);
  return eventSchema.parse({ ...sorted[0], type: "GROUPED_NOTICES", body: lines.join("\n"),
    actionUrl: new Set(sorted.map(e => e.actionUrl)).size === 1 ? sorted[0].actionUrl : "/notificacoes",
    critical: sorted.some(e => e.critical),
    dedupeKey: `group:${createHash("sha256").update(sorted.map(e => e.dedupeKey).sort().join("\n")).digest("hex").slice(0, 32)}`,
  });
}
