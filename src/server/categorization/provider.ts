export const MIN_PROVIDER_CONFIDENCE = 0.8;

export type ProviderSuggestion = { categoryKey: string; confidence: number } | null;

/** The provider receives only a batch of sanitized normalized description strings. */
export interface CategorizerProvider {
  categorize(descriptions: readonly string[]): Promise<readonly ProviderSuggestion[] | null>;
}

export const disabledCategorizerProvider: CategorizerProvider = {
  async categorize() { return null; },
};

/** Environment readiness is observable without returning or logging the key itself. */
export function readFutureProviderConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    provider: env.CATEGORIZATION_PROVIDER ?? "disabled",
    apiKeyConfigured: Boolean(env.CATEGORIZATION_API_KEY),
  };
}
