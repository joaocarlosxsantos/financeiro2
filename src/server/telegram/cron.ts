import { validWebhookSecret } from "./protocol";
import { buildInsight, insightWindow, type InsightData, type InsightWindow, type Preferences } from "./insights";

export type InsightRecipient = { userId: string; chatId: string; prefs: Preferences };
export interface CronDependencies {
  candidates(window: InsightWindow, afterUserId?: string): Promise<InsightRecipient[]>;
  data(userId: string, window: InsightWindow): Promise<InsightData>;
  renderMessage?(recipient: InsightRecipient, window: InsightWindow): Promise<string | null>;
  claim(userId: string, windowKey: string): Promise<boolean>;
  stillEnabled(recipient: InsightRecipient, window: InsightWindow): Promise<boolean>;
  send(chatId: string, text: string): Promise<void>;
  finish(userId: string, windowKey: string, status: "SENT" | "FAILED" | "CANCELLED"): Promise<void>;
}

export async function runInsightBatch(window: InsightWindow, deps: CronDependencies) {
  const result = { sent: 0, skipped: 0, failed: 0 };
  const started = Date.now();
  let afterUserId: string | undefined;
  while (true) {
    const recipients = await deps.candidates(window, afterUserId);
    for (let offset = 0; offset < recipients.length; offset += 5) {
      if (Date.now() - started > 240_000) return { ...result, remaining: true };
      await Promise.all(recipients.slice(offset, offset + 5).map(async (recipient) => {
        let claimed = false;
        try {
          if (!recipient.prefs.enabled || !recipient.prefs.hours.includes(window.hour) || (window.monthly && !recipient.prefs.summary)) { result.skipped++; return; }
          if (!await deps.claim(recipient.userId, window.key)) { result.skipped++; return; }
          claimed = true;
          const text = deps.renderMessage
            ? await deps.renderMessage(recipient, window)
            : buildInsight(await deps.data(recipient.userId, window), recipient.prefs, window);
          if (!text) {
            await deps.finish(recipient.userId, window.key, "CANCELLED");
            result.skipped++; return;
          }
          if (!await deps.stillEnabled(recipient, window)) {
            await deps.finish(recipient.userId, window.key, "CANCELLED");
            result.skipped++; return;
          }
          await deps.send(recipient.chatId, text);
          await deps.finish(recipient.userId, window.key, "SENT");
          result.sent++;
        } catch {
          result.failed++;
          if (claimed) {
            try { await deps.finish(recipient.userId, window.key, "FAILED"); }
            catch { /* Reserva permanece: não repetir envio de resultado incerto. */ }
          }
        }
      }));
    }
    if (recipients.length < 100) break;
    afterUserId = recipients[recipients.length - 1].userId;
  }
  return result;
}

export async function handleInsightsCron(
  request: Request, secret: string | undefined, deps: CronDependencies,
  now = new Date(), selectWindow: (now: Date) => InsightWindow | null = insightWindow,
) {
  const headers = { "Cache-Control": "no-store" };
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
  if (!validWebhookSecret(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const window = selectWindow(now);
  if (!window) return Response.json({ sent: 0, skipped: 0, failed: 0 }, { headers });
  try { return Response.json(await runInsightBatch(window, deps), { headers }); }
  catch { return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers }); }
}
