"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, importBatches, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseStatement } from "@/lib/parsers";
import { fingerprint, normalize, suggestCategoryId } from "@/lib/categorize";
import { INVOICE_PAYMENT_HINTS } from "@/lib/invoices";

export type PreviewRow = {
  date: string;
  description: string;
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  categoryId: string | null;
  nature: "FIXED" | "VARIABLE";
  /** Pagamento de fatura e afins: entra como transferência, fora dos totais. */
  isTransfer: boolean;
  /** true = não importar (duplicata detectada ou desmarcada pelo usuário) */
  duplicate: boolean;
  fingerprint: string;
};

export type PreviewResult = {
  error?: string;
  fileName?: string;
  accountId?: string;
  rows?: PreviewRow[];
  warnings?: string[];
  detectedColumns?: Record<string, string>;
  duplicates?: number;
};

/**
 * Lê o arquivo, sugere categoria para cada linha e marca duplicatas.
 * Nada é gravado aqui — o usuário confere antes.
 */
export async function previewImport(input: {
  fileName: string;
  content: string;
  accountId: string;
  invertSign?: boolean;
}): Promise<PreviewResult> {
  const userId = await requireUserId();

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return { error: "Escolha uma conta válida para receber os lançamentos." };

  const parsed = parseStatement(input.fileName, input.content, { invertSign: input.invertSign });
  if (!parsed.rows.length) {
    return {
      error: parsed.warnings[0] ?? "Não encontramos lançamentos nesse arquivo.",
      warnings: parsed.warnings,
    };
  }

  const cats = await db
    .select({
      id: categories.id,
      name: categories.name,
      keywords: categories.keywords,
      kind: categories.kind,
      nature: categories.nature,
    })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.archived, false)));

  const natureById = new Map(cats.map((c) => [c.id, c.nature]));

  const prints = new Set<string>();
  const rows: PreviewRow[] = parsed.rows.map((r) => {
    const kind: "INCOME" | "EXPENSE" = r.amountCents >= 0 ? "INCOME" : "EXPENSE";
    const amountCents = Math.abs(r.amountCents);
    const date = new Date(`${r.date}T12:00:00.000Z`);
    const fp = fingerprint({
      accountId: input.accountId,
      date,
      amountCents,
      description: r.description,
    });
    prints.add(fp);

    const description = normalize(r.description);
    const isTransfer = INVOICE_PAYMENT_HINTS.some((hint) => description.includes(normalize(hint)));
    const categoryId = isTransfer ? null : suggestCategoryId(r.description, cats, kind);

    return {
      date: r.date,
      description: r.description,
      amountCents,
      kind,
      categoryId,
      isTransfer,
      nature: (categoryId ? (natureById.get(categoryId) ?? "VARIABLE") : "VARIABLE") as
        | "FIXED"
        | "VARIABLE",
      duplicate: false,
      fingerprint: fp,
    };
  });

  const existing = await db
    .select({ fingerprint: transactions.fingerprint })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.fingerprint, [...prints])));

  const existingSet = new Set(existing.map((e) => e.fingerprint));

  let duplicates = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (existingSet.has(row.fingerprint) || seen.has(row.fingerprint)) {
      row.duplicate = true;
      duplicates++;
    }
    seen.add(row.fingerprint);
  }

  return {
    fileName: input.fileName,
    accountId: input.accountId,
    rows,
    warnings: parsed.warnings,
    detectedColumns: parsed.detectedColumns,
    duplicates,
  };
}

export async function commitImport(input: {
  fileName: string;
  accountId: string;
  source: "CSV" | "OFX";
  rows: PreviewRow[];
}): Promise<{ error?: string; saved?: number }> {
  const userId = await requireUserId();

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return { error: "Conta inválida." };

  const rows = input.rows.filter((r) => !r.duplicate && r.amountCents > 0);
  if (!rows.length) return { error: "Nenhuma linha selecionada para importar." };

  const [batch] = await db
    .insert(importBatches)
    .values({
      userId,
      accountId: input.accountId,
      fileName: input.fileName,
      source: input.source,
      rowCount: input.rows.length,
      status: "COMMITTED",
      savedRows: 0,
    })
    .returning({ id: importBatches.id });

  const inserted = await db
    .insert(transactions)
    .values(
      rows.map((r) => ({
        userId,
        accountId: input.accountId,
        categoryId: r.categoryId,
        date: new Date(`${r.date}T12:00:00.000Z`),
        description: r.description,
        amountCents: r.amountCents,
        kind: r.kind,
        nature: (r.kind === "INCOME" ? "VARIABLE" : r.nature) as "FIXED" | "VARIABLE",
        isTransfer: r.isTransfer,
        importBatchId: batch.id,
        fingerprint: r.fingerprint,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: transactions.id });

  await db
    .update(importBatches)
    .set({ savedRows: inserted.length })
    .where(eq(importBatches.id, batch.id));

  revalidatePath("/lancamentos");
  revalidatePath("/painel");
  revalidatePath("/importar");
  return { saved: inserted.length };
}
