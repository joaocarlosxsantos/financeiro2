import { validWebhookSecret } from "@/server/telegram/protocol";
import {
  dailySummaryDependencies,
  dailySummaryWindow,
  runDailySummaryBatch,
} from "@/server/telegram/daily-summary";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }

  if (!validWebhookSecret(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }

  const now = new Date();
  const window = dailySummaryWindow(now);
  if (!window) {
    return Response.json({ sent: 0, skipped: 0, failed: 0, reason: "outside_window" }, { headers });
  }

  try {
    const result = await runDailySummaryBatch(window, dailySummaryDependencies, now);
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers });
  }
}
