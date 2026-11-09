import type { CategoryKind, ExpenseNature } from "@/db/schema";
import { matchMcc, matchMerchant } from "./catalog";
import { normalizeDescription } from "./normalize";
import { disabledCategorizerProvider, MIN_PROVIDER_CONFIDENCE, type CategorizerProvider } from "./provider";

export type CategorizationCategory = { id: string; name: string; kind: CategoryKind; nature: ExpenseNature; keywords: readonly string[] };
export type CategoryKey = "salary" | "extra_income" | "investment_income" | "housing" | "home_bills" | "education" | "health" | "subscriptions" | "fixed_transport" | "debt" | "groceries" | "dining" | "transport" | "leisure" | "shopping" | "personal_care" | "other";
export type CategorizationLayer = "user" | "rule" | "dictionary" | "provider" | "none";
export type CategorizationResult = {
  normalizedKey: string;
  categoryId: string | null;
  nature: ExpenseNature | null;
  isTransfer: boolean;
  suggestIsCardPayment: boolean;
  layer: CategorizationLayer;
};
export type CategorizationInput = { description: string; kind: CategoryKind; payeeMCC?: number | string | null; operationType?: string | null };
export type CategorizationCounts = { user: number; rule: number; dictionary: number; provider: number; none: number; transfers: number; cardPaymentSuggestions: number };

const PROVIDER_CATEGORY_NAMES: Record<CategoryKey, string> = {
  salary: "Salário", extra_income: "Renda extra", investment_income: "Rendimentos", housing: "Moradia",
  home_bills: "Contas de casa", education: "Educação", health: "Saúde", subscriptions: "Assinaturas",
  fixed_transport: "Transporte fixo", debt: "Dívidas e juros", groceries: "Mercado", dining: "Alimentação fora",
  transport: "Transporte", leisure: "Lazer", shopping: "Compras", personal_care: "Cuidados pessoais", other: "Outros",
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function categoryByName(categories: readonly CategorizationCategory[], name: string, kind: CategoryKind): CategorizationCategory | null {
  const wanted = fold(name);
  return categories.find((category) => category.kind === kind && fold(category.name) === wanted) ?? null;
}

function categoryByKeyword(categories: readonly CategorizationCategory[], description: string, kind: CategoryKind): CategorizationCategory | null {
  const match = categories
    .filter((category) => category.kind === kind)
    .flatMap((category) => category.keywords.map((keyword) => ({ category, keyword: fold(keyword) })))
    .filter(({ keyword }) => keyword.length > 1 && description.includes(keyword))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0];
  return match?.category ?? null;
}

function providerKey(value: string): CategoryKey | null {
  const folded = fold(value);
  const directKey = folded.toLowerCase() as CategoryKey;
  if (directKey in PROVIDER_CATEGORY_NAMES) return directKey;
  return (Object.entries(PROVIDER_CATEGORY_NAMES).find(([, name]) => fold(name) === folded)?.[0] as CategoryKey | undefined) ?? null;
}

function exactRule(input: CategorizationInput, categories: readonly CategorizationCategory[]): CategorizationCategory | null {
  const description = fold(input.description);
  const income = input.kind === "INCOME";
  if (income && /\b(SALARIO|FOLHA\s+DE?\s+PAGAMENTO|REMUNERACAO|PROVENTO)\b/.test(description)) return categoryByName(categories, "Salário", input.kind);
  if (income && /\b(REND(?:IMENTO)?|REND\s+PAGO|DIVIDENDO|RESGATE|CDB|TESOURO)\b/.test(description)) return categoryByName(categories, "Rendimentos", input.kind);
  if (income && /\b(PIX\s+RECEBIDO|TED\s+RECEBID[AO]|DOC\s+RECEBID[AO]|ESTORNO|REEMBOLSO|DEVOLUCAO)\b/.test(description)) return categoryByName(categories, "Renda extra", input.kind);
  if (!income && /\b(IOF|ANUIDADE|JUROS|ENCARGOS|MULTA|ROTATIVO|PARCELAMENTO\s+FATURA)\b/.test(description)) return categoryByName(categories, "Dívidas e juros", input.kind);
  return null;
}

function transferMatches(description: string, ownAccountNames: readonly string[]): boolean {
  const value = fold(description);
  if (/\b(TRANSFERENCIA ENTRE MINHAS CONTAS|TRANSFERENCIA ENTRE CONTAS PROPRIAS|TED ENTRE CONTAS PROPRIAS)\b/.test(value)) return true;
  return ownAccountNames.some((name) => {
    const normalizedName = fold(name);
    return normalizedName.length >= 4 && value.includes(normalizedName) && /\b(PIX|TED|DOC|TRANSFERENCIA|TRANSF)\b/.test(value);
  });
}

function cardPaymentMatches(description: string, operationType?: string | null): boolean {
  return operationType === "PAGAMENTO_FATURA" || /\b(PAGTO|PAGAMENTO|PGTO)\s+(?:DA\s+)?FATURA\b|\bPAGTO\s+CARTAO\b/.test(fold(description));
}

function deterministic(input: CategorizationInput, categories: readonly CategorizationCategory[]): CategorizationCategory | null {
  const rules = exactRule(input, categories);
  if (rules) return rules;
  const normalized = normalizeDescription(input.description);
  const merchant = matchMerchant(normalized.key);
  if (merchant && merchant.kind === input.kind) {
    const category = categoryByName(categories, merchant.categoryName, input.kind);
    if (category) return category;
  }
  const mcc = matchMcc(input.payeeMCC);
  if (mcc && mcc.kind === input.kind) {
    const category = categoryByName(categories, mcc.categoryName, input.kind);
    if (category) return category;
  }
  return categoryByKeyword(categories, normalized.key, input.kind);
}

export function categorizeDeterministic(
  input: CategorizationInput,
  categories: readonly CategorizationCategory[],
  userRules: ReadonlyMap<string, string> = new Map(),
  ownAccountNames: readonly string[] = [],
): CategorizationResult {
  const normalized = normalizeDescription(input.description);
  if (transferMatches(input.description, ownAccountNames)) return { normalizedKey: normalized.key, categoryId: null, nature: null, isTransfer: true, suggestIsCardPayment: false, layer: "rule" };
  const cardPayment = cardPaymentMatches(input.description, input.operationType);
  if (cardPayment) return { normalizedKey: normalized.key, categoryId: null, nature: null, isTransfer: false, suggestIsCardPayment: true, layer: "rule" };
  const historyId = userRules.get(normalized.key);
  const historyCategory = historyId ? categories.find((category) => category.id === historyId && category.kind === input.kind) : null;
  if (historyCategory) return { normalizedKey: normalized.key, categoryId: historyCategory.id, nature: historyCategory.nature, isTransfer: false, suggestIsCardPayment: false, layer: "user" };
  const rule = exactRule(input, categories);
  if (rule) return { normalizedKey: normalized.key, categoryId: rule.id, nature: rule.nature, isTransfer: false, suggestIsCardPayment: false, layer: "rule" };
  const dictionary = deterministic(input, categories);
  if (dictionary) return { normalizedKey: normalized.key, categoryId: dictionary.id, nature: dictionary.nature, isTransfer: false, suggestIsCardPayment: false, layer: "dictionary" };
  return { normalizedKey: normalized.key, categoryId: null, nature: null, isTransfer: false, suggestIsCardPayment: false, layer: "none" };
}

export async function categorizeBatch(
  inputs: readonly CategorizationInput[],
  options: {
    categories: readonly CategorizationCategory[];
    userRules?: ReadonlyMap<string, string>;
    providerCache?: ReadonlyMap<string, { categoryKey: string; confidence: number }>;
    ownAccountNames?: readonly string[];
    provider?: CategorizerProvider;
  },
): Promise<{ results: CategorizationResult[]; counts: CategorizationCounts; aiCacheUpdates: Array<{ normalizedKey: string; categoryId: string }> }> {
  const userRules = options.userRules ?? new Map<string, string>();
  const deterministicResults = inputs.map((input) => categorizeDeterministic(input, options.categories, userRules, options.ownAccountNames));
  const unresolvedByKey = new Map<string, { description: string; indexes: number[]; kind: CategoryKind }>();
  deterministicResults.forEach((result, index) => {
    if (result.layer !== "none") return;
    const previous = unresolvedByKey.get(result.normalizedKey);
    const safeDescription = normalizeDescription(inputs[index]!.description).providerDescription;
    if (previous) previous.indexes.push(index);
    else unresolvedByKey.set(result.normalizedKey, { description: safeDescription, indexes: [index], kind: inputs[index]!.kind });
  });
  const results = [...deterministicResults];
  const provider = options.provider ?? disabledCategorizerProvider;
  const pending: Array<{ key: string; description: string; indexes: number[]; kind: CategoryKind }> = [];
  const cacheUpdates: Array<{ normalizedKey: string; categoryId: string }> = [];
  for (const [key, item] of unresolvedByKey) {
    const cached = options.providerCache?.get(key);
    if (cached && cached.confidence >= MIN_PROVIDER_CONFIDENCE) {
      const canonical = providerKey(cached.categoryKey);
      const category = canonical ? categoryByName(options.categories, PROVIDER_CATEGORY_NAMES[canonical], item.kind) : null;
      if (category) {
        for (const index of item.indexes) results[index] = { ...results[index]!, categoryId: category.id, nature: category.nature, layer: "provider" };
        continue;
      }
    }
    pending.push({ key, ...item });
  }
  if (pending.length) {
    const suggestions = await provider.categorize(pending.map((item) => item.description));
    if (suggestions) {
      pending.forEach((item, position) => {
        const suggestion = suggestions[position];
        if (!suggestion || suggestion.confidence < MIN_PROVIDER_CONFIDENCE) return;
        const canonical = providerKey(suggestion.categoryKey);
        const category = canonical ? categoryByName(options.categories, PROVIDER_CATEGORY_NAMES[canonical], item.kind) : null;
        if (!category) return;
        for (const index of item.indexes) results[index] = { ...results[index]!, categoryId: category.id, nature: category.nature, layer: "provider" };
        cacheUpdates.push({ normalizedKey: item.key, categoryId: category.id });
      });
    }
  }
  const counts: CategorizationCounts = { user: 0, rule: 0, dictionary: 0, provider: 0, none: 0, transfers: 0, cardPaymentSuggestions: 0 };
  for (const result of results) {
    counts[result.layer]++;
    if (result.isTransfer) counts.transfers++;
    if (result.suggestIsCardPayment) counts.cardPaymentSuggestions++;
  }
  return { results, counts, aiCacheUpdates: cacheUpdates };
}

export { normalizeDescription } from "./normalize";
export { disabledCategorizerProvider, MIN_PROVIDER_CONFIDENCE, readFutureProviderConfig, type CategorizerProvider } from "./provider";
