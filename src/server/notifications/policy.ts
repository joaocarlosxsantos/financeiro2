import { z } from "zod";

export const categories = ["dueBills", "cardInvoice", "budget", "negativeForecast", "spending", "summary", "syncAlerts", "goals"] as const;
export const actionUrls = ["/notificacoes", "/painel", "/contas", "/contas-a-pagar", "/orcamento", "/metas", "/recorrentes", "/insights", "/configuracoes/integracao"] as const;
const flag = () => z.boolean().default(true);
export const preferencesSchema = z.object({
  channelInApp: flag(), channelPush: flag(), channelTelegram: flag(),
  dueBills: flag(), cardInvoice: flag(), budget: flag(), negativeForecast: flag(), spending: flag(), summary: flag(), syncAlerts: flag(), goals: flag(),
  quietHoursEnabled: flag(), quietStartHour: z.number().int().min(0).max(23).default(22), quietEndHour: z.number().int().min(0).max(23).default(8),
  discretePushMode: flag(),
}).strict();
export type NotificationPreferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_NOTIFICATION_PREFERENCES = preferencesSchema.parse({});
export const eventSchema = z.object({
  userId: z.string().min(1).max(32), category: z.enum(categories), type: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  body: z.string().min(1).max(3800), actionUrl: z.enum(actionUrls).default("/notificacoes"),
  dedupeKey: z.string().min(1).max(200), critical: z.boolean().default(false),
}).strict();
export type NotificationEvent = z.infer<typeof eventSchema>;
export function isQuiet(prefs: NotificationPreferences, now = new Date()) {
  if (!prefs.quietHoursEnabled || prefs.quietStartHour === prefs.quietEndHour) return false;
  const hour = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(now));
  return prefs.quietStartHour > prefs.quietEndHour ? hour >= prefs.quietStartHour || hour < prefs.quietEndHour
    : hour >= prefs.quietStartHour && hour < prefs.quietEndHour;
}
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.hash && (!u.port || u.port === "443") &&
      (["fcm.googleapis.com", "web.push.apple.com", "updates.push.services.mozilla.com"].includes(u.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname));
  } catch { return false; }
}
const key = (length: number) => z.string().max(256).regex(/^[A-Za-z0-9_-]+$/).refine(value => Buffer.from(value, "base64url").length === length);
export const subscriptionSchema = z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint), expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: key(65), auth: key(16) }).strict() }).strict();
export function pushPayload(event: NotificationEvent, prefs: NotificationPreferences, id: string) {
  return { title: "Mutano Contas", body: prefs.discretePushMode ? "Você tem uma nova notificação. Abra o app para conferir." : event.body.slice(0, 180),
    url: event.actionUrl, tag: `mutano-${id}`, icon: "/icon-192.png", badge: "/icon-192.png" };
}
