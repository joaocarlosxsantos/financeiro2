import { handleWebhook } from "@/server/telegram/webhook";
import { processMessage } from "@/server/telegram/store";
import { registerCommandMenu } from "@/server/telegram/command-menu";
import { processInlineCallback, replyKeyboard } from "@/server/telegram/callback-store";
import { sendCallbackDetails, sendCallbackResult } from "@/server/telegram/callback-delivery";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleWebhook(request, process.env.TELEGRAM_WEBHOOK_SECRET, processMessage,
    chatId => registerCommandMenu(chatId, process.env.TELEGRAM_BOT_TOKEN),
    { callback: processInlineCallback, keyboard: replyKeyboard, details: sendCallbackDetails,
      background: { schedule: after, notify: sendCallbackResult } });
}
