"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, importBatches, transactions } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseStatement } from "@/lib/parsers";
import { fingerprint, suggestCategoryId } from "@/lib/categorize";
import { DEFAULT_CLOSING_DAY, DEFAULT_DUE_DAY, invoiceLabel, type InvoiceRef } from "@/lib/invoices";
import { resolveImportDate, type ImportKind } from "@/lib/import-dates";
import { formatDate } from "@/lib/dates";
import { getCardInvoices } from "@/server/queries";

export type { ImportKind } from "@/lib/import-dates";

/**
 * Duas formas de importar, porque o arquivo do banco conta a história de um
 * jeito diferente em cada caso — e isso muda em que mês cada linha deve virar
 * lançamento (veja resolveImportDate em src/lib/import-dates.ts).
 *
 * GENERAL: extrato ou "lançamentos gerais" — cobre um período, pode ter
 * qualquer tipo de lançamento, e cada linha tem a data real daquele
 * movimento. Exceção: parcela de cartão, onde o arquivo repete a data da
 * COMPRA original em toda parcela.
 *
 * CLOSED_INVOICE: a fatura de um mês fechado, já com o total que vai (ou já
 * foi) pago. Toda linha do arquivo pertence a ESSA fatura, ponto — mesmo que
 * a data impressa seja a da compra original, meses atrás.
 */

export type PreviewRow = {
  /** Data que vai para o banco — já ajustada quando necessário. */
  date: string;
  /** Só preenchida quando `date` foi ajustada: a data que o arquivo trazia. */
  originalDate?: string;
  description: string;
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  categoryId: string | null;
  nature: "FIXED" | "VARIABLE";
  /**
   * Transferência (pagamento de fatura, transferência entre contas suas etc.):
   * entra no saldo, mas fora dos relatórios de receita/despesa. Ninguém
   * detecta isso sozinho — o usuário marca a linha na prévia, do mesmo jeito
   * que já faz em Lançamentos.
   */
  isTransfer: boolean;
  /** true = não importar (desmarcada pelo usuário). Todas as linhas começam marcadas. */
  duplicate: boolean;
  /** Informativo: já existe um lançamento com essa mesma data/valor/descrição/conta. Não desmarca sozinho. */
  possibleDuplicate: boolean;
  fingerprint: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** A data mudou em relação ao arquivo (parcela reposicionada, ou fatura fechada forçou o mês). */
  dateAdjusted: boolean;
  /**
   * Só relevante quando dateAdjusted é true: false no caso raro em que não
   * foi possível encaixar a data na fatura escolhida (limite de segurança do
   * cálculo) — a linha precisa de atenção manual.
   */
  dateMatched: boolean;
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

export type InvoiceOption = {
  ref: InvoiceRef;
  label: string;
  closingDate: string;
  dueDate: string;
  status: "aberta" | "fechada" | "paga" | "vencida" | "sem-registro";
};

/**
 * Lista as faturas recentes de um cartão para o seletor de "fatura de mês
 * fechado" — em vez de um campo de mês solto.
 *
 * Por quê: a fatura é identificada aqui pelo mês de VENCIMENTO (é assim que
 * o resto do app já rotula, em /faturas), mas quem fala "a fatura de
 * setembro" no dia a dia geralmente quer dizer a que FECHA em setembro — e
 * essas duas coisas costumam ser meses diferentes. Mostrando fechamento e
 * vencimento ao lado do rótulo, o usuário confirma visualmente que escolheu
 * a fatura certa antes de importar, em vez de adivinhar pelo nome do mês.
 */
export async function listCardInvoiceOptions(accountId: string): Promise<InvoiceOption[] | { error: string }> {
  const userId = await requireUserId();

  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      color: accounts.color,
      type: accounts.type,
      closingDay: accounts.closingDay,
      dueDay: accounts.dueDay,
    })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return { error: "Conta não encontrada." };
  if (account.type !== "CREDIT_CARD") return { error: "Escolha uma conta do tipo cartão de crédito." };

  const card = {
    id: account.id,
    name: account.name,
    color: account.color,
    closingDay: account.closingDay ?? DEFAULT_CLOSING_DAY,
    dueDay: account.dueDay ?? DEFAULT_DUE_DAY,
    usingDefaults: account.closingDay === null || account.dueDay === null,
  };

  // 2 faturas à frente (a aberta e a seguinte) + 12 meses de histórico —
  // cobre tanto importar uma fatura recém-fechada quanto reprocessar algo antigo.
  const today = new Date();
  const invoices = await getCardInvoices(userId, card, 12, today);

  return invoices
    .slice()
    .reverse()
    .map((inv) => ({
      ref: inv.ref,
      label: inv.label,
      closingDate: inv.closingDate.toISOString().slice(0, 10),
      dueDate: inv.dueDate.toISOString().slice(0, 10),
      status: inv.status,
    }));
}

/**
 * Lê o arquivo, sugere categoria para cada linha e marca duplicatas.
 * Nada é gravado aqui — o usuário confere antes.
 */
export async function previewImport(input: {
  fileName: string;
  content: string;
  accountId: string;
  invertSign?: boolean;
  importKind?: ImportKind;
  invoiceRef?: InvoiceRef;
}): Promise<PreviewResult> {
  const userId = await requireUserId();
  const importKind = input.importKind ?? "GENERAL";

  const [account] = await db
    .select({ id: accounts.id, type: accounts.type, closingDay: accounts.closingDay, dueDay: accounts.dueDay })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return { error: "Escolha uma conta válida para receber os lançamentos." };

  if (importKind === "CLOSED_INVOICE") {
    if (account.type !== "CREDIT_CARD") {
      return { error: "Fatura de mês fechado é só para conta do tipo cartão de crédito." };
    }
    if (!input.invoiceRef) {
      return { error: "Escolha a qual fatura (mês e ano) este arquivo pertence." };
    }
  }

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
  const isCard = account.type === "CREDIT_CARD";
  const closingDay = account.closingDay ?? DEFAULT_CLOSING_DAY;
  const dueDay = account.dueDay ?? DEFAULT_DUE_DAY;

  const prints = new Set<string>();
  const warnings = [...parsed.warnings];
  let unmatchedCount = 0;

  const rows: PreviewRow[] = parsed.rows.map((r) => {
    const kind: "INCOME" | "EXPENSE" = r.amountCents >= 0 ? "INCOME" : "EXPENSE";
    const amountCents = Math.abs(r.amountCents);
    const printedDate = new Date(`${r.date}T12:00:00.000Z`);

    const resolved = resolveImportDate(printedDate, r.description, {
      importKind,
      invoiceRef: input.invoiceRef,
      isCard,
      closingDay,
      dueDay,
    });
    if (resolved.adjusted && !resolved.matched) unmatchedCount++;

    const fp = fingerprint({
      accountId: input.accountId,
      date: resolved.date,
      amountCents,
      description: r.description,
    });
    prints.add(fp);

    // Transferência (pagamento de fatura, transferência entre contas suas) não
    // dá pra adivinhar com segurança pelo texto — cada banco escreve diferente,
    // e um palpite errado escondia gasto real dos relatórios sem o usuário
    // perceber. Todas as linhas entram como não-transferência; quem sabe o que
    // é o quê é o usuário, marcando na prévia.
    const categoryId = suggestCategoryId(r.description, cats, kind);

    return {
      date: resolved.date.toISOString().slice(0, 10),
      originalDate: resolved.adjusted ? r.date : undefined,
      description: r.description,
      amountCents,
      kind,
      categoryId,
      isTransfer: false,
      nature: (categoryId ? (natureById.get(categoryId) ?? "VARIABLE") : "VARIABLE") as
        | "FIXED"
        | "VARIABLE",
      // Todas as linhas começam marcadas para importar — é o usuário quem
      // desmarca, mesmo quando há uma possível duplicata (veja abaixo).
      duplicate: false,
      possibleDuplicate: false,
      fingerprint: fp,
      installmentNumber: resolved.marker?.number ?? null,
      installmentTotal: resolved.marker?.total ?? null,
      dateAdjusted: resolved.adjusted,
      dateMatched: resolved.matched,
    };
  });

  if (unmatchedCount > 0) {
    warnings.push(
      `${unmatchedCount} linha(s) não encaixaram automaticamente na fatura escolhida — confira a data delas antes de importar.`,
    );
  }
  if (importKind === "CLOSED_INVOICE" && input.invoiceRef) {
    const adjustedCount = rows.filter((r) => r.dateAdjusted).length;
    if (adjustedCount > 0) {
      warnings.push(
        `${adjustedCount} linha(s) tinham a data da compra original — foram reposicionadas para a fatura de ${invoiceLabel(input.invoiceRef)}.`,
      );
    }
  }

  const existing = await db
    .select({ fingerprint: transactions.fingerprint })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.fingerprint, [...prints])));

  const existingSet = new Set(existing.map((e) => e.fingerprint));

  // Só informativo: mostra o aviso e marca a linha visualmente, mas não
  // desmarca ninguém sozinho. Se for mesmo duplicata, o banco recusa a
  // gravação (fingerprint é único) — não corre o risco de duplicar; se não
  // for, o usuário não perde um lançamento por engano.
  let duplicates = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (existingSet.has(row.fingerprint) || seen.has(row.fingerprint)) {
      row.possibleDuplicate = true;
      duplicates++;
    }
    seen.add(row.fingerprint);
  }
  if (duplicates > 0) {
    warnings.push(
      `${duplicates} linha(s) parecem já existir no sistema (mesma data, valor e descrição) — continuam marcadas para importar. Desmarque na tabela abaixo se alguma for mesmo repetida.`,
    );
  }

  return {
    fileName: input.fileName,
    accountId: input.accountId,
    rows,
    warnings,
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
        installmentNumber: r.installmentNumber,
        installmentTotal: r.installmentTotal,
        notes: r.dateAdjusted && r.originalDate ? `Compra original em ${formatDate(r.originalDate)}` : null,
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
  revalidatePath("/faturas");
  return { saved: inserted.length };
}

/**
 * Desfaz uma importação inteira — apaga todos os lançamentos que vieram dela.
 * Para quando um arquivo foi importado com data errada (ou conta errada) e o
 * jeito mais simples de corrigir é jogar fora e importar de novo.
 */
export async function deleteImportBatch(batchId: string): Promise<{ error?: string; deleted?: number }> {
  const userId = await requireUserId();

  const [batch] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)))
    .limit(1);
  if (!batch) return { error: "Importação não encontrada." };

  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.importBatchId, batchId)))
    .returning({ id: transactions.id });

  await db.delete(importBatches).where(eq(importBatches.id, batchId));

  revalidatePath("/lancamentos");
  revalidatePath("/painel");
  revalidatePath("/importar");
  revalidatePath("/faturas");
  return { deleted: deleted.length };
}
