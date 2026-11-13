import { handleScheduledRefreshCron } from "@/server/open-finance/refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleScheduledRefreshCron(request);
}
