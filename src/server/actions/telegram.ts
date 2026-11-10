"use server";

import { requireUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { disconnect, issueLink } from "@/server/telegram/store";
import { getTelegramPreferences, setTelegramPreferences } from "@/server/telegram/insight-store";
import { preferenceSchema, type Preferences } from "@/server/telegram/insights";

export type TelegramState = { error?: string; url?: string; expiresAt?: string; disconnected?: boolean };
export type TelegramPreferenceState = { error?: string; prefs?: Preferences; ok?: boolean };

export async function loadTelegramPreferences(): Promise<TelegramPreferenceState> {
  const userId = await requireUserId();
  try { return { prefs: await getTelegramPreferences(userId) }; }
  catch { return { error: "Não foi possível carregar as preferências. Tente novamente." }; }
}

export async function saveTelegramPreferences(input: unknown): Promise<TelegramPreferenceState> {
  const userId = await requireUserId();
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return { error: "Selecione pelo menos um horário válido e confira os tipos de aviso." };
  try {
    await setTelegramPreferences(userId, parsed.data);
    return { ok: true, prefs: parsed.data };
  } catch { return { error: "Não foi possível salvar as preferências. Tente novamente." }; }
}

export async function createTelegramLink(): Promise<TelegramState> {
  const userId = await requireUserId();
  if (!checkRateLimit(`telegram-link:${userId}`, 5).allowed) return { error: "Aguarde alguns minutos antes de gerar outro link." };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !process.env.TELEGRAM_WEBHOOK_SECRET) return { error: "O Telegram ainda não foi configurado pelo administrador." };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    const bot: unknown = await response.json();
    const username = (bot as { result?: { username?: unknown } })?.result?.username;
    if (!response.ok || !(bot as { ok?: boolean })?.ok || typeof username !== "string" || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      return { error: "Não foi possível localizar o bot. Tente novamente mais tarde." };
    }
    const code = await issueLink(userId);
    return { url: `https://t.me/${username}?start=${code.code}`, expiresAt: code.expiresAt.toISOString() };
  } catch {
    return { error: "Não foi possível gerar o vínculo. Tente novamente mais tarde." };
  }
}

export async function disconnectTelegram(): Promise<TelegramState> {
  const userId = await requireUserId();
  try {
    await disconnect(userId);
    return { disconnected: true };
  } catch {
    return { error: "Não foi possível desconectar. Tente novamente mais tarde." };
  }
}
