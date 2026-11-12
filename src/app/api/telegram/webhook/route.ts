import { handleWebhook } from "@/server/telegram/webhook";
import { processMessage } from "@/server/telegram/store";
import { registerCommandMenu } from "@/server/telegram/command-menu";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleWebhook(request, process.env.TELEGRAM_WEBHOOK_SECRET, processMessage,
    chatId => registerCommandMenu(chatId, process.env.TELEGRAM_BOT_TOKEN));
}
