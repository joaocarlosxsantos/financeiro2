import { handleNotificationCron } from "@/server/notifications/cron";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) { return handleNotificationCron(request, "daily"); }
