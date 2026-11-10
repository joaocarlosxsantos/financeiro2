import type { TelegramPreferenceState } from "@/server/actions/telegram";
import type { Preferences } from "@/server/telegram/insights";

type Operation = "initial-load" | "reload" | "save";
export type PreferenceFeedback = { prefs?: Preferences; unavailable?: boolean; error?: string; message?: string };

/** Falha passiva de leitura é indisponibilidade; falhas após ação continuam explícitas. */
export async function preferenceFeedback(request: () => Promise<TelegramPreferenceState>, operation: Operation): Promise<PreferenceFeedback> {
  let result: TelegramPreferenceState;
  try { result = await request(); }
  catch { result = { error: operation === "save" ? "Não foi possível salvar. Entre no app novamente e tente outra vez." : "Não foi possível carregar as preferências. Tente novamente." }; }

  if (operation === "initial-load") return result.prefs ? { prefs: result.prefs } : { unavailable: true };
  if (result.error) return { error: result.error, ...(operation === "reload" ? { unavailable: true } : {}) };
  if (operation === "save") return result.ok ? { prefs: result.prefs, message: "Preferências de avisos salvas." } : { error: "Não foi possível confirmar a gravação. Tente novamente." };
  return result.prefs ? { prefs: result.prefs } : { unavailable: true, error: "Não foi possível carregar as preferências. Tente novamente." };
}
