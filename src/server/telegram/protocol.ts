import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HELP, LINKED_WELCOME } from "./commands";
export { HELP } from "./commands";

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


function commandText(text: string | undefined) {
  const value = text?.trim() ?? "";
  // Only normalize the command token. Link codes and arguments are case-sensitive.
  return value.replace(/^\/[a-z_]+(?:@[a-z0-9_]{5,32})?(?=\s|$)/i,
    token => token.split("@")[0].toLowerCase());
}

export function isFreeQuestion(text: string | undefined) {
  const value = text?.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";
  if (!value || value.startsWith("/")) return false;
  // Greetings and unrelated/unknown messages take the local welcome path,
  // rather than consuming AI quota. This is routing, never authorization.
  return /\b(saldos?|disponivel|investid[oa]s?|investimentos?|patrimonio|dinheiro|gastos?|gastei|gastou|gastar|compras?|despesas?|receitas?|recebi|entrou|saiu|renda|salario|categorias?|assinaturas?|faturas?|cartao|cartoes|contas?|venc\w*|pagar|paguei|pagamentos?|orcamento|economiz\w*|economia|lancamentos?|financeir\w*)\b/.test(value)
    || /\bquanto\s+(?:eu\s+)?tenho\b/.test(value)
    || /\bcompar\w*\b.*\b(mes|meses|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(value);
}

export function isFinancialCommand(text: string | undefined): boolean {
  const value = commandText(text);
  return ["/saldo", "/resumo", "/previsao", "/hoje", "/assinaturas", "/relatorio", "/cartao"].includes(value) || value.startsWith("/cartao ");
}

export interface CommandDependencies {
  consumeCode(codeHash: string, chatId: string): Promise<boolean>;
  linkedUser(chatId: string): Promise<string | null>;
  balance(userId: string): Promise<{ availableCents: number; investedCents?: number; netWorthCents?: number; totalIncomplete: boolean; needsOpeningBalance: boolean }>;
  summary?(userId: string): Promise<string>;
  report?(userId: string): Promise<string>;
  forecast?(userId: string): Promise<string>;
  dailyBudget?(userId: string): Promise<string>;
  subscriptions?(userId: string): Promise<string>;
  cards?(userId: string): Promise<string>;
  pause?(userId: string): Promise<void>;
}

export async function commandReply(message: TelegramMessage, deps: CommandDependencies): Promise<string> {
  const text = commandText(message.text);
  const chatId = String(message.chat.id);
  if (text.startsWith("/start ")) {
    const code = text.slice(7);
    if (!codePattern.test(code)) return "Link inválido ou expirado. Gere outro em Configurações.";
    const linked = await deps.consumeCode(hashCode(code), chatId);
    return linked ? LINKED_WELCOME : "Link inválido, expirado ou conta já vinculada. Desconecte no app e gere outro link.";
  }
  const isCardsCommand = text === "/cartao" || text.startsWith("/cartao ");
  if (!isFinancialCommand(text) && text !== "/pausar") {
    const owner = await deps.linkedUser(chatId);
    return owner ? HELP : "Vincule seu Telegram em Configurações no Mutano Contas para usar o bot. Gere o link de vínculo no app.";
  }
  const userId = await deps.linkedUser(chatId);
  if (!userId) {
    if (text === "/resumo") return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar o resumo.";
    if (text === "/relatorio") return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar o relatório.";
    if (isCardsCommand) return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar cartões.";
    if (text === "/previsao") return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar a previsão.";
    if (text === "/hoje") return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar o cálculo diário.";
    if (text === "/assinaturas") return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar assinaturas.";
    return "Vincule seu Telegram em Configurações no Mutano Contas antes de consultar o saldo.";
  }
  if (text === "/relatorio") {
    return deps.report ? deps.report(userId) : "Relatório temporariamente indisponível.";
  }
  if (isCardsCommand) return deps.cards ? deps.cards(userId) : "Resumo de cartões temporariamente indisponível.";
  if (text === "/previsao") return deps.forecast ? deps.forecast(userId) : "Previsão temporariamente indisponível.";
  if (text === "/hoje") return deps.dailyBudget ? deps.dailyBudget(userId) : "Cálculo diário temporariamente indisponível.";
  if (text === "/assinaturas") return deps.subscriptions ? deps.subscriptions(userId) : "Assinaturas temporariamente indisponíveis.";
  if (text === "/resumo") return deps.summary ? deps.summary(userId) : "Resumo temporariamente indisponível.";
  if (text === "/pausar") {
    if (!deps.pause) return "Não foi possível pausar agora. Tente no app.";
    await deps.pause(userId);
    return "Avisos automáticos pausados. Para retomar, abra Configurações no app. /saldo e /resumo continuam disponíveis.";
  }
  const result = await deps.balance(userId);
  const money = (cents: number | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((typeof cents === "number" && Number.isFinite(cents) ? cents : 0) / 100);
  return `Saldos registrados no app:\nDisponível: ${money(result.availableCents)}\nInvestido: ${money(result.investedCents)}\nPatrimônio: ${money(result.netWorthCents)}` +
    (result.totalIncomplete ? " Total parcial: há conta integrada sem saldo atualizado." : "") +
    (result.needsOpeningBalance ? " Confira os saldos iniciais das contas no app." : "");
}
