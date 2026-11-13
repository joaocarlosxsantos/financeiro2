import { todayRef } from "@/lib/dates";
import type { UsageProfile } from "@/lib/usage-profile";
import { getUsageProfile } from "@/server/usage-profile";
import { askClaude, askGemini } from "./ai";
import { selectAiProvider } from "./ai-provider";
import { AI_FAILURE, AI_LIMITED, AI_UNAVAILABLE } from "./ai-policy";
import { consumeAiQuota } from "./ai-quota";
import { executeReadTool } from "./ai-tools";

export const PROFILE_INSTRUCTIONS: Record<UsageProfile, string> = {
  integracao_total: "Perfil do app: integração total. Não sugira cadastro, importação ou lançamento manual. Atualizações de movimentação vêm da integração; planejamento no app continua disponível.",
  hibrido: "Perfil do app: híbrido. O usuário pode usar integração e dados manuais no app. Você continua exclusivamente de leitura.",
  manual: "Perfil do app: somente manual. Não sugira conexão ou sincronização Open Finance. As atualizações são feitas pelo usuário no app, nunca pelo bot.",
};

/** Chamado apenas após resolver userId do chat no servidor, fora da transação do webhook. */
export async function answerQuestion(userId: string, chatId: string, question: string, now = new Date()): Promise<string> {
  const provider = selectAiProvider();
  if (!provider) return AI_UNAVAILABLE;
  try {
    if (!await consumeAiQuota(chatId, now)) return AI_LIMITED;
    const profile = await getUsageProfile(userId);
    if (!PROFILE_INSTRUCTIONS[profile]) return AI_FAILURE;
    const today = todayRef(now);
    const ask = provider === "gemini" ? askGemini : askClaude;
    return await ask(question, today, PROFILE_INSTRUCTIONS[profile], {
      runTool: (name, input) => executeReadTool(userId, name, input, today),
    });
  } catch { return AI_FAILURE; }
}
