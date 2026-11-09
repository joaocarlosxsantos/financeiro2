"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, categoryRules, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { categorizeBatch, disabledCategorizerProvider, type CategorizationCategory } from "@/server/categorization";

export async function recategorizeUncategorizedTransactions() {
  const userId = await requireUserId();
  const [categoryRows, ruleRows, ownAccounts, pending] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, kind: categories.kind, nature: categories.nature, keywords: categories.keywords }).from(categories).where(and(eq(categories.userId, userId), eq(categories.archived, false))),
    db.select({ normalizedPattern: categoryRules.normalizedPattern, categoryId: categoryRules.categoryId, source: categoryRules.source }).from(categoryRules).where(eq(categoryRules.userId, userId)),
    db.select({ name: accounts.name }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.archived, false))),
    db.select({ id: transactions.id, description: transactions.description, kind: transactions.kind }).from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.categoryId), eq(transactions.isTransfer, false))),
  ]);
  const categoriesForEngine: CategorizationCategory[] = categoryRows;
  const userRules = new Map(ruleRows.filter((rule) => rule.source === "USER").map((rule) => [rule.normalizedPattern, rule.categoryId]));
  const providerCache = new Map(ruleRows.filter((rule) => rule.source === "AI").flatMap((rule) => {
    const category = categoryRows.find((candidate) => candidate.id === rule.categoryId);
    return category ? [[rule.normalizedPattern, { categoryKey: category.name, confidence: 1 }] as const] : [];
  }));
  const categorized = await categorizeBatch(pending.map((row) => ({ description: row.description, kind: row.kind })), {
    categories: categoriesForEngine,
    userRules,
    providerCache,
    ownAccountNames: ownAccounts.map((account) => account.name),
    provider: disabledCategorizerProvider,
  });
  for (const cacheUpdate of categorized.aiCacheUpdates) {
    await db.insert(categoryRules).values({ userId, normalizedPattern: cacheUpdate.normalizedKey, categoryId: cacheUpdate.categoryId, source: "AI", updatedAt: new Date() })
      .onConflictDoUpdate({ target: [categoryRules.userId, categoryRules.normalizedPattern], set: { categoryId: cacheUpdate.categoryId, source: "AI", updatedAt: new Date() } });
  }
  let updated = 0;
  for (let index = 0; index < pending.length; index++) {
    const row = pending[index]!;
    const result = categorized.results[index]!;
    if (!result.categoryId && !result.isTransfer) continue;
    await db.update(transactions).set({ categoryId: result.categoryId, isTransfer: result.isTransfer, ...(result.nature ? { nature: result.nature } : {}), updatedAt: new Date() })
      .where(and(eq(transactions.id, row.id), eq(transactions.userId, userId), isNull(transactions.categoryId)));
    updated++;
  }
  revalidatePath("/lancamentos");
  revalidatePath("/painel");
  return { ok: true, updated, counts: categorized.counts };
}
