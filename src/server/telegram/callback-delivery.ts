import { appDetailsUrl, createDraftUndoKeyboard, type DetailAction } from "./inline-actions";
import type { TelegramCallback } from "./protocol";

/** Final callback outcome is delivered in chat after the immediate webhook ACK. */
export async function sendCallbackResult(callback: TelegramCallback, text: string,
  token = process.env.TELEGRAM_BOT_TOKEN, fetcher: typeof fetch = fetch) {
  if (!token) return false;
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(2_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: callback.message.chat.id, text, protect_content: true }),
    });
    const data: unknown = await response.json();
    return response.ok && typeof data === "object" && data !== null && "ok" in data && data.ok === true;
  } catch { return false; }
}

/** Fixed Telegram endpoint; no user-supplied URL is ever requested. */
export async function sendCallbackDetails(callback: TelegramCallback, action: DetailAction,
  token = process.env.TELEGRAM_BOT_TOKEN, fetcher: typeof fetch = fetch) {
  if (!token) return false;
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(2_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: callback.message.chat.id, text: "Veja os detalhes no app.", protect_content: true,
        reply_markup: { inline_keyboard: [[{ text: "Abrir no app", url: appDetailsUrl(action) }]] } }),
    });
    const data: unknown = await response.json();
    return response.ok && typeof data === "object" && data !== null && "ok" in data && data.ok === true;
  } catch { return false; } // Never log token-bearing URLs or provider response bodies.
}

/** Envia mensagem com botão para desfazer o lançamento confirmado. */
export async function sendCallbackDraftUndo(chatId: string, text: string, draftId: string, owner: string, secret: string,
  token = process.env.TELEGRAM_BOT_TOKEN, fetcher: typeof fetch = fetch) {
  if (!token) return false;
  try {
    const keyboard = createDraftUndoKeyboard(draftId, chatId, owner, secret);
    const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(2_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: Number(chatId), text, protect_content: true, reply_markup: keyboard }),
    });
    const data: unknown = await response.json();
    return response.ok && typeof data === "object" && data !== null && "ok" in data && data.ok === true;
  } catch { return false; }
}
