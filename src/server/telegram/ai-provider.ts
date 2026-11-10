export type AiProvider = "gemini" | "anthropic";
export type ProviderEnvironment = { AI_PROVIDER?: string; GEMINI_API_KEY?: string; ANTHROPIC_API_KEY?: string };

/** Escolha explícita nunca troca silenciosamente o provedor de dados/custo. */
export function selectAiProvider(env: ProviderEnvironment = {
  AI_PROVIDER: process.env.AI_PROVIDER, GEMINI_API_KEY: process.env.GEMINI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
}): AiProvider | null {
  const selected = env.AI_PROVIDER?.trim();
  if (selected) {
    if (selected === "gemini") return env.GEMINI_API_KEY?.trim() ? "gemini" : null;
    if (selected === "anthropic") return env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : null;
    return null;
  }
  if (env.GEMINI_API_KEY?.trim()) return "gemini";
  if (env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  return null;
}
