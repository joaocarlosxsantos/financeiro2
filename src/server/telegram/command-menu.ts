import { BOT_COMMANDS } from "./commands";

/** Called only after a welcome authorized by the owner link or a valid link code. */
export async function registerCommandMenu(chatId: string, token: string | undefined, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!token || !/^[1-9]\d*$/.test(chatId) || !Number.isSafeInteger(Number(chatId))) return false;
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(2_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: BOT_COMMANDS, scope: { type: "chat", chat_id: chatId }, language_code: "" }),
    });
    const result: unknown = await response.json();
    return response.ok && typeof result === "object" && result !== null && "ok" in result && result.ok === true;
  } catch {
    // Menu registration is optional. Never log token-bearing URLs/provider errors
    // or replace the welcome with an error if Telegram is temporarily unavailable.
    return false;
  }
}
