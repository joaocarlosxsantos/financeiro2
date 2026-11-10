import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const MAX_BODY_BYTES = 16_384;
export const MAX_TEXT_LENGTH = 512;
export const LINK_TTL_MS = 10 * 60_000;
export const CHAT_WINDOW_MS = 60_000;
export const CHAT_MAX_REQUESTS = 10;
export const codePattern = /^[A-Za-z0-9_-]{43}$/;

export function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function newLinkCode() {
  const code = randomBytes(32).toString("base64url");
  return { code, codeHash: hashCode(code), expiresAt: new Date(Date.now() + LINK_TTL_MS) };
}

export function validWebhookSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const id = z.number().int().positive().refine(Number.isSafeInteger);
export const updateSchema = z.object({
  update_id: z.number().int().nonnegative().max(2_147_483_647),
  message: z.object({
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
    chat: z.object({ id, type: z.literal("private") }),
    from: z.object({ id, is_bot: z.literal(false) }),
  }).optional(),
}).refine((value) => !value.message || value.message.chat.id === value.message.from.id);

export type TelegramUpdate = z.infer<typeof updateSchema>;
export type TelegramMessage = NonNullable<TelegramUpdate["message"]>;

export const HELP = "Mutano Contas: /saldo consulta seu saldo disponível; /resumo traz os números e avisos do dia; /pausar desliga avisos automáticos; /ajuda mostra os comandos. Quando habilitadas, perguntas livres usam o provedor de IA configurado (Google Gemini ou Anthropic Claude), enviando pergunta e dados mínimos; limite de 2 por minuto e 20 por dia. Sem IA, comandos e avisos por regra continuam funcionando. Para vincular, retomar avisos ou desconectar, abra Configurações no app.";

export function isFreeQuestion(text: string | undefined) {
  const value = text?.trim() ?? "";
  return value.length > 0 && !value.startsWith("/");
}

export interface CommandDependencies {
  consumeCode(codeHash: string, chatId: string): Promise<boolean>;
  linkedUser(chatId: string): Promise<string | null>;
  balance(userId: string): Promise<{ availableCents: number; totalIncomplete: boolean; needsOpeningBalance: boolean }>;
  summary?(userId: string): Promise<string>;
  pause?(userId: string): Promise<void>;
}

export async function commandReply(message: TelegramMessage, deps: CommandDependencies): Promise<string> {
  const text = message.text?.trim() ?? "";
  const chatId = String(message.chat.id);
  if (text === "/ajuda") return HELP;
  if (text === "/start") return "Abra Configurações no Mutano Contas e gere seu link de vínculo. " + HELP;
  if (text.startsWith("/start ")) {
    const code = text.slice(7);
    if (!codePattern.test(code)) return "Link inválido ou expirado. Gere outro em Configurações.";
    const linked = await deps.consumeCode(hashCode(code), chatId);
    return linked ? "Telegram vinculado ao Mutano Contas. Use /saldo ou /ajuda." : "Link inválido, expirado ou conta já vinculada. Desconecte no app e gere outro link.";
  }
  if (!["/saldo", "/resumo", "/pausar"].includes(text)) return HELP;
  const userId = await deps.linkedUser(chatId);
  if (!userId) return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar o saldo.";
  if (text === "/resumo") return deps.summary ? deps.summary(userId) : "Resumo temporariamente indisponível.";
  if (text === "/pausar") {
    if (!deps.pause) return "Não foi possível pausar agora. Tente no app.";
    await deps.pause(userId);
    return "Avisos automáticos pausados. Para retomar, abra Configurações no app. /saldo e /resumo continuam disponíveis.";
  }
  const result = await deps.balance(userId);
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(result.availableCents / 100);
  return `Saldo disponível registrado no app: ${amount}.` +
    (result.totalIncomplete ? " Total parcial: há conta integrada sem saldo atualizado." : "") +
    (result.needsOpeningBalance ? " Confira os saldos iniciais das contas no app." : "");
}
