import { handleInsightsCron } from "@/server/telegram/cron";
import { cronDependencies } from "@/server/telegram/insight-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleInsightsCron(request, process.env.CRON_SECRET, cronDependencies);
}
