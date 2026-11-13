import { after } from "next/server";
import { handlePluggyWebhook } from "@/server/open-finance/webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePluggyWebhook(request, process.env.PLUGGY_WEBHOOK_SECRET, { schedule: after });
}
