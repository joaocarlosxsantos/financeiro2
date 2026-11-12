import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CALLBACK_TTL_SECONDS = 24 * 60 * 60;
export const SILENCE_TYPES = {
  s0: { field: "summary", label: "resumos" },
  s1: { field: "spending", label: "gastos acima do usual" },
  s2: { field: "dueBills", label: "contas a vencer" },
  s3: { field: "budget", label: "orçamento" },
  s4: { field: "cardInvoice", label: "faturas" },
  s5: { field: "negativeForecast", label: "previsão de saldo negativo" },
} as const;
const DETAILS = { d0: "/contas", d1: "/contas", d2: "/painel", d3: "/orcamento", d4: "/recorrentes", d5: "/insights", d6: "/contas-a-pagar" } as const;
export type DetailAction = keyof typeof DETAILS;
export type SilenceAction = keyof typeof SILENCE_TYPES;
export type DraftAction = `tc:${string}` | `tu:${string}` | `tx:${string}`;
export type InlineAction = "p" | DetailAction | SilenceAction | DraftAction;
export type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };
const COMMAND_ACTIONS: Record<string, { details: DetailAction; silence?: SilenceAction }> = {
  "/saldo": { details: "d0", silence: "s5" },
  "/cartao": { details: "d1", silence: "s4" },
  "/resumo": { details: "d2", silence: "s0" },
  "/previsao": { details: "d2", silence: "s5" },
  "/hoje": { details: "d3", silence: "s3" },
  "/assinaturas": { details: "d4" },
  "/relatorio": { details: "d5", silence: "s0" },
};

export function actionForCommand(text: string) {
  const command = text.trim().split(/\s/)[0].split("@")[0].toLowerCase();
  return Object.hasOwn(COMMAND_ACTIONS, command) ? COMMAND_ACTIONS[command] : null;
}

function tag(payload: string, chatId: string, owner: string, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify([payload, chatId, owner])).digest().subarray(0, 16).toString("base64url");
}

export function signActionToken(action: InlineAction, chatId: string, owner: string, secret: string, now = new Date()) {
  const expires = (Math.floor(now.getTime() / 1000) + CALLBACK_TTL_SECONDS).toString(36);
  const payload = `v1:${action}:${expires}:${randomBytes(6).toString("base64url")}`;
  return `${payload}:${tag(payload, chatId, owner, secret)}`;
}

export function readActionToken(data: string, chatId: string, owner: string, secret: string | undefined, now = new Date()):
  { action: InlineAction } | { error: "invalid" | "expired" } {
  const parts = /^v1:(p|d[0-6]|s[0-5]|t[cux]:[a-zA-Z0-9_-]{6,16}):([a-z0-9]{1,8}):([A-Za-z0-9_-]{8}):([A-Za-z0-9_-]{22})$/.exec(data);
  if (!parts || !secret || Buffer.byteLength(data) > 64) return { error: "invalid" };
  const payload = data.slice(0, data.lastIndexOf(":"));
  const actual = Buffer.from(parts[4]);
  const expected = Buffer.from(tag(payload, chatId, owner, secret));
  if (!timingSafeEqual(actual, expected)) return { error: "invalid" };
  if (parseInt(parts[2], 36) <= Math.floor(now.getTime() / 1000)) return { error: "expired" };
  return { action: parts[1] as InlineAction };
}

export function createDraftConfirmKeyboard(
  draftId: string,
  chatId: string,
  owner: string,
  secret: string,
  now = new Date(),
): InlineKeyboard {
  const button = (text: string, action: InlineAction) => ({ text, callback_data: signActionToken(action, chatId, owner, secret, now) });
  return {
    inline_keyboard: [
      [button("✅ Confirmar", `tc:${draftId}`), button("❌ Cancelar", `tx:${draftId}`)],
    ],
  };
}

export function createDraftUndoKeyboard(
  draftId: string,
  chatId: string,
  owner: string,
  secret: string,
  now = new Date(),
): InlineKeyboard {
  const button = (text: string, action: InlineAction) => ({ text, callback_data: signActionToken(action, chatId, owner, secret, now) });
  return {
    inline_keyboard: [
      [button("↩️ Desfazer", `tu:${draftId}`)],
    ],
  };
}

export function createActionKeyboard(command: string, chatId: string, owner: string, secret: string, now = new Date()): InlineKeyboard {
  const context = actionForCommand(command);
  if (!context) return { inline_keyboard: [] };
  const button = (text: string, action: InlineAction) => ({ text, callback_data: signActionToken(action, chatId, owner, secret, now) });
  return { inline_keyboard: [
    [button("Ver detalhes", context.details)],
    [button("Pausar avisos", "p"), ...(context.silence ? [button("Silenciar tipo", context.silence)] : [])],
  ] };
}

export function appDetailsUrl(action: DetailAction, configured = process.env.NEXT_PUBLIC_APP_URL) {
  let origin = "https://mutanocontas.vercel.app";
  try {
    const url = new URL(configured ?? origin);
    if (url.protocol === "https:" && !url.username && !url.password) origin = url.origin;
  } catch { /* Use the fixed app origin if configuration is invalid. */ }
  return new URL(DETAILS[action], origin).toString();
}

export const CALLBACK_TEXT = {
  denied: "Vincule seu Telegram no app para usar os botões.",
  invalid: "Botão inválido. Envie /menu e tente novamente.",
  expired: "Botão expirado. Envie /menu e tente novamente.",
  replay: "Este pedido já foi processado ou ficou desatualizado. Envie /menu.",
  limited: "Muitos toques. Aguarde um minuto e tente de novo.",
  paused: "Avisos pausados. Retome em Configurações no app.",
  failed: "Não foi possível concluir. Tente novamente.",
  details: "Detalhes enviados no chat.",
  detailsFailed: "Não consegui abrir os detalhes. Tente novamente.",
} as const;
export type InlineResult = { text: string; details?: DetailAction };
