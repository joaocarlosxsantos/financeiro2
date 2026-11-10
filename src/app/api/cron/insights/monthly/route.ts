import { handleInsightsCron } from "@/server/telegram/cron";
import { cronDependencies } from "@/server/telegram/insight-store";
import { loadMonthlyReport, monthlyWindow } from "@/server/telegram/monthly-report";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleInsightsCron(request, process.env.CRON_SECRET, {
    ...cronDependencies,
    renderMessage: (recipient, window) => loadMonthlyReport(recipient.userId, new Date(`${window.day}T12:00:00Z`), undefined, recipient.prefs),
  }, new Date(), monthlyWindow);
}
