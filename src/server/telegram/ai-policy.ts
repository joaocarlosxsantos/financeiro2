import { z } from "zod";

export const AI_MODEL = "claude-haiku-5-5";
export const AI_MAX_OUTPUT_TOKENS = 500;
export const AI_MAX_CALLS = 3;
export const AI_MAX_TOOLS = 4;
export const AI_MAX_TOOL_BYTES = 2500;
export const AI_MAX_RESPONSE_BYTES = 32_768;
export const AI_MAX_HISTORY_BYTES = 16_000;
export const AI_TIMEOUT_MS = 18_000;
export const AI_DAILY_LIMIT = 20;
export const AI_MINUTE_LIMIT = 2;
export const AI_FAILURE = "Não consegui consultar a IA agora. Tente novamente mais tarde ou use /saldo e /resumo.";
export const AI_UNAVAILABLE = "A IA está indisponível no momento. Você pode usar /saldo, /resumo e /ajuda; os avisos por regra continuam funcionando.";
export const AI_LIMITED = "Você atingiu o limite de perguntas com IA (2 por minuto e 20 por dia, em São Paulo). Aguarde ou use /saldo e /resumo.";
export const AI_NO_DATA = "Posso consultar saldo, gastos por categoria e período, maiores despesas, comparação de meses e contas a vencer. Inclua o período na sua pergunta.";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const period = z.object({ start_date: dateSchema, end_date: dateSchema }).strict();
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const toolSchemas = {
  get_balance: z.object({}).strict(),
  get_spending_by_category: period,
  get_largest_expenses: period.extend({ limit: z.number().int().min(1).max(5) }).strict(),
  compare_months: z.object({ first_month: month, second_month: month }).strict(),
  get_due_bills: z.object({ days: z.number().int().min(0).max(7) }).strict(),
};
export type ToolName = keyof typeof toolSchemas;
export type ToolInput<Name extends ToolName> = z.infer<(typeof toolSchemas)[Name]>;

const descriptions: Record<ToolName, string> = {
  get_balance: "Saldos atuais em centavos BRL: disponível, investido e patrimônio líquido, com indicação de total parcial. Mostre Investido separado do Disponível; patrimônio já inclui investimentos, metas e dívidas. Não some os campos novamente.",
  get_spending_by_category: "Até cinco categorias com maiores despesas no período inclusivo, máximo 93 dias, sem transferências ou pagamentos de cartão.",
  get_largest_expenses: "Até cinco maiores despesas no período inclusivo de até 93 dias: data, categoria e valor, sem descrição privada ou conta bancária.",
  compare_months: "Compara entradas e despesas de dois meses completos/registrados. No máximo 24 meses de distância; não inclui dias futuros.",
  get_due_bills: "Até cinco contas ainda não pagas que vencem hoje ou nos próximos 0 a 7 dias. Valores totais da conta, inclusive contas em grupo.",
};
export const AI_TOOLS = (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
  name, description: descriptions[name], input_schema: z.toJSONSchema(toolSchemas[name], { target: "draft-7" }),
}));

export function validToolInput(name: string, input: unknown, today: string) {
  if (!Object.hasOwn(toolSchemas, name)) return null;
  const parsed = toolSchemas[name as ToolName].safeParse(input);
  if (!parsed.success) return null;
  const args = parsed.data;
  if ("start_date" in args) {
    const diff = new Date(args.end_date).getTime() - new Date(args.start_date).getTime();
    if (diff < 0 || diff > 92 * 86_400_000 || args.end_date > today || args.start_date < "2000-01-01") return null;
  }
  if ("first_month" in args) {
    const index = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5));
    if (Math.abs(index(args.first_month) - index(args.second_month)) > 24 || args.first_month > today.slice(0, 7) || args.second_month > today.slice(0, 7)) return null;
  }
  return { name: name as ToolName, input: args };
}

/** Nunca encaminhar links, identificadores de conta, notas ou credenciais ao provedor. */
function redactLinks(value: string) {
  return value.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+|mailto:\S+|tg:\S+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}(?:\/\S*)?|\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/\S*)?/gi, "[link removido]");
}

export function safeLabel(value: string) {
  return redactLinks(value)
    .replace(/\bAIza[A-Za-z0-9_-]{30,}/g, "[segredo removido]")
    .replace(/\b(?:sk-ant-|sk-|Bearer\s+)[A-Za-z0-9_-]+/gi, "[segredo removido]")
    .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 60);
}

export function safeAnswer(text: string, secrets: readonly string[]) {
  let result = text;
  for (const secret of secrets) if (secret) result = result.replaceAll(secret, "[segredo removido]");
  result = redactLinks(result)
    .replace(/\bAIza[A-Za-z0-9_-]{30,}/g, "[segredo removido]")
    .replace(/\b(?:sk-ant-|sk-|Bearer\s+)[A-Za-z0-9_-]+/gi, "[segredo removido]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return result.trim().slice(0, 1800);
}
