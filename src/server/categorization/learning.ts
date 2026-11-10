import { and, eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { categories, categoryRules, type CategoryKind, type ExpenseNature } from "@/db/schema";
import { normalizeDescription } from "./normalize";

type DbOrTx = typeof defaultDb | Parameters<Parameters<typeof defaultDb.transaction>[0]>[0];

export type LearnedRuleRecord = {
  normalizedPattern: string;
  categoryId: string;
  kind: CategoryKind;
  nature: ExpenseNature | null;
};

/**
 * Constrói um mapa de busca rápida por padrão normalizado.
 */
export function buildRulesLookupMap(records: readonly LearnedRuleRecord[]): Map<string, LearnedRuleRecord> {
  const map = new Map<string, LearnedRuleRecord>();
  for (const r of records) {
    map.set(r.normalizedPattern, r);
  }
  return map;
}

/**
 * Tenta encontrar uma regra aprendida que case com a descrição normalizada e com o tipo (INCOME/EXPENSE).
 */
export function matchLearnedRule(
  description: string,
  kind: CategoryKind,
  rulesMap: ReadonlyMap<string, LearnedRuleRecord>,
): LearnedRuleRecord | null {
  const normalized = normalizeDescription(description);
  let rule = rulesMap.get(normalized.key);
  if (!rule) {
    // Tenta sem números soltos no final (ex: identificadores de terminal ou código de filial)
    const strippedKey = normalized.key.replace(/\b\d+\b/g, "").replace(/\s+/g, " ").trim();
    if (strippedKey && strippedKey !== normalized.key) {
      rule = rulesMap.get(strippedKey);
    }
  }
  if (!rule) return null;
  if (rule.kind !== kind) return null;
  return rule;
}

/**
 * Salva ou atualiza a regra aprendida para o usuário a partir de uma descrição corrigida ou categorizada.
 */
export async function learnCategoryRule(
  dbClient: DbOrTx,
  params: {
    userId: string;
    description: string;
    categoryId: string;
    source?: "USER" | "AI";
  },
): Promise<{ ok: boolean; pattern?: string }> {
  const { userId, description, categoryId, source = "USER" } = params;
  if (!userId || !description || !categoryId) return { ok: false };

  const normalized = normalizeDescription(description);
  if (!normalized.key) return { ok: false };

  // Garante que a categoria pertence ao usuário (proteção contra IDOR)
  const [cat] = await dbClient
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);

  if (!cat) return { ok: false };

  await dbClient
    .insert(categoryRules)
    .values({
      userId,
      normalizedPattern: normalized.key,
      categoryId,
      source,
      matchCount: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [categoryRules.userId, categoryRules.normalizedPattern],
      set: {
        categoryId,
        source,
        updatedAt: new Date(),
        matchCount: sql`${categoryRules.matchCount} + 1`,
      },
    });

  return { ok: true, pattern: normalized.key };
}

/**
 * Busca uma regra aprendida no banco para uma única transação e atualiza o contador de aplicação.
 */
export async function findLearnedCategory(
  dbClient: typeof defaultDb,
  params: {
    userId: string;
    description: string;
    kind: CategoryKind;
  },
): Promise<{ categoryId: string; nature: ExpenseNature | null } | null> {
  const { userId, description, kind } = params;
  const normalized = normalizeDescription(description);
  if (!normalized.key) return null;

  const [match] = await dbClient
    .select({
      categoryId: categoryRules.categoryId,
      nature: categories.nature,
      kind: categories.kind,
      ruleId: categoryRules.id,
    })
    .from(categoryRules)
    .innerJoin(categories, eq(categoryRules.categoryId, categories.id))
    .where(
      and(
        eq(categoryRules.userId, userId),
        eq(categoryRules.normalizedPattern, normalized.key),
        eq(categories.archived, false),
      ),
    )
    .limit(1);

  if (!match || match.kind !== kind) return null;

  // Atualiza lastAppliedAt de forma não-bloqueante
  dbClient
    .update(categoryRules)
    .set({ lastAppliedAt: new Date() })
    .where(eq(categoryRules.id, match.ruleId))
    .catch(() => {
      // Falha silenciosa em telemetria não trava fluxo do usuário
    });

  return { categoryId: match.categoryId, nature: match.nature };
}

/**
 * Carrega todas as regras aprendidas de um usuário em um mapa para processamento rápido em lote (ex.: importação).
 */
export async function loadUserRulesMap(
  dbClient: typeof defaultDb,
  userId: string,
): Promise<Map<string, LearnedRuleRecord>> {
  const rows = await dbClient
    .select({
      normalizedPattern: categoryRules.normalizedPattern,
      categoryId: categoryRules.categoryId,
      kind: categories.kind,
      nature: categories.nature,
    })
    .from(categoryRules)
    .innerJoin(categories, eq(categoryRules.categoryId, categories.id))
    .where(and(eq(categoryRules.userId, userId), eq(categories.archived, false)));

  return buildRulesLookupMap(rows);
}
