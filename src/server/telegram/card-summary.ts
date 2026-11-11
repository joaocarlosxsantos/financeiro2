import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, openFinanceInvoices, transactions } from "@/db/schema";
import { getCivilToday, invoiceCycle } from "@/lib/invoices";
import { cardPurchasesThrough, transactionDateOrder, transactionsInInvoice } from "../transaction-dates";

export interface CardPurchase {
  description: string;
  amountCents: number;
  date: Date;
}

export interface CardSummaryData {
  id: string;
  name: string;
  invoiceCents: number;
  invoiceRef?: string;
  dueDay?: number | null;
  availableLimitCents?: number | null;
  totalLimitCents?: number | null;
  recentPurchases: CardPurchase[];
}

export function sanitizeCardName(name: string): string {
  if (!name) return "Cartão de Crédito";
  // Remove caracteres de controle e quebras de linha
  let cleaned = name.replace(/[\u0000-\u001f\u007f\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  // Se contiver sequência de dígitos longa (como número de cartão > 4 dígitos com ou sem espaços)
  // Mas preserva se já for "Final 1234"
  cleaned = cleaned.replace(/(?:Final\s+)?(\d[\d\s-]{4,}\d)/i, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length <= 4) return match;
    const last4 = digits.slice(-4);
    return `Final ${last4}`;
  });
  return cleaned.slice(0, 50);
}

export function sanitizePurchaseDescription(desc: string): string {
  if (!desc) return "Compra";
  const cleaned = desc.replace(/[\u0000-\u001f\u007f\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 45);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDayMonth(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function formatCardSummary(cards: CardSummaryData[]): string {
  if (cards.length === 0) {
    return "Nenhum cartão de crédito cadastrado. Cadastre suas contas em Configurações > Contas no Mutano Contas.";
  }

  const displayedCards = cards.slice(0, 5);
  const blocks: string[] = [];

  for (const card of displayedCards) {
    const cardTitle = sanitizeCardName(card.name);
    const invoiceFormatted = formatCurrency(card.invoiceCents);
    const limitFormatted =
      card.availableLimitCents !== undefined && card.availableLimitCents !== null
        ? formatCurrency(card.availableLimitCents)
        : "não informado";

    const lines: string[] = [
      `💳 *${cardTitle}*`,
      `• Fatura atual: ${invoiceFormatted}`,
      `• Limite disponível: ${limitFormatted}`,
    ];

    if (card.recentPurchases.length === 0) {
      lines.push("• Nenhuma compra recente registrada");
    } else {
      lines.push("• Últimas compras:");
      for (const purchase of card.recentPurchases.slice(0, 5)) {
        const desc = sanitizePurchaseDescription(purchase.description);
        const amount = formatCurrency(purchase.amountCents);
        const dateStr = formatDayMonth(new Date(purchase.date));
        lines.push(`  - ${dateStr} ${desc}: ${amount}`);
      }
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n").slice(0, 3800);
}

export async function loadCardSummary(
  userId: string,
  connection: Pick<typeof db, "select"> = db,
  now: Date = new Date(),
): Promise<string> {
  // Busca cartões de crédito não arquivados do usuário (máximo 5)
  const cardAccounts = await connection
    .select({
      id: accounts.id,
      name: accounts.name,
      closingDay: accounts.closingDay,
      dueDay: accounts.dueDay,
      creditLimitCents: accounts.creditLimitCents,
      availableCreditCents: accounts.availableCreditCents,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.type, "CREDIT_CARD"),
        eq(accounts.archived, false),
      ),
    )
    .limit(5);

  if (cardAccounts.length === 0) {
    return formatCardSummary([]);
  }

  const civilToday = getCivilToday(now);

  const cardSummaries: CardSummaryData[] = await Promise.all(
    cardAccounts.map(async (card) => {
      let currentCycleRef: string | null = null;
      let periodStart: Date | null = null;
      let closesOn: Date | null = null;

      if (card.closingDay && card.dueDay) {
        try {
          const cycle = invoiceCycle(civilToday, card.closingDay, card.dueDay);
          currentCycleRef = cycle.ref;
          periodStart = cycle.periodStart;
          closesOn = cycle.closesOn;
        } catch {
          // Valores fora do intervalo 1-31 caem no fallback
        }
      }

      // 1. Busca fatura do Open Finance, se houver
      let invoiceCents: number | null = null;
      if (currentCycleRef) {
        const [ofInvoice] = await connection
          .select({ totalAmountCents: openFinanceInvoices.totalAmountCents })
          .from(openFinanceInvoices)
          .where(
            and(
              eq(openFinanceInvoices.userId, userId),
              eq(openFinanceInvoices.accountId, card.id),
              eq(openFinanceInvoices.invoiceRef, currentCycleRef),
            ),
          )
          .limit(1);

        if (ofInvoice && ofInvoice.totalAmountCents !== null) {
          invoiceCents = ofInvoice.totalAmountCents;
        }
      }

      // 2. Se não houver fatura do Open Finance, calcula a soma das despesas na fatura
      if (invoiceCents === null) {
        const invoiceConditions = [
          eq(transactions.userId, userId),
          eq(transactions.accountId, card.id),
          eq(transactions.kind, "EXPENSE"),
          eq(transactions.isTransfer, false),
          eq(transactions.isCardPayment, false),
          or(
            isNull(transactions.externalStatus),
            eq(transactions.externalStatus, "POSTED"),
            eq(transactions.externalStatus, "PENDING"),
          ),
        ];

        if (currentCycleRef && periodStart && closesOn) {
          invoiceConditions.push(
            transactionsInInvoice(
              currentCycleRef,
              and(
                sql`${transactions.date} >= ${periodStart.toISOString()}::timestamptz`,
                sql`${transactions.date} <= ${closesOn.toISOString()}::timestamptz`,
              ),
            ),
          );
        }

        const [txSum] = await connection
          .select({
            total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
          })
          .from(transactions)
          .where(and(...invoiceConditions));

        invoiceCents = Number(txSum?.total ?? 0);
      }

      // 3. Limite disponível:
      // Se availableCreditCents estiver preenchido, usa diretamente;
      // senão, se houver creditLimitCents, calcula (limite total - fatura atual);
      // senão, não informado.
      let availableLimitCents: number | null = null;
      if (card.availableCreditCents !== null && card.availableCreditCents !== undefined) {
        availableLimitCents = card.availableCreditCents;
      } else if (card.creditLimitCents !== null && card.creditLimitCents !== undefined) {
        availableLimitCents = Math.max(0, card.creditLimitCents - invoiceCents);
      }

      // 4. Últimas 5 compras
      const recentPurchases = await connection
        .select({
          description: transactions.description,
          amountCents: transactions.amountCents,
          date: transactions.date,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.accountId, card.id),
            eq(transactions.kind, "EXPENSE"),
            eq(transactions.isTransfer, false),
            eq(transactions.isCardPayment, false),
            cardPurchasesThrough(civilToday),
            or(
              isNull(transactions.externalStatus),
              eq(transactions.externalStatus, "POSTED"),
              eq(transactions.externalStatus, "PENDING"),
            ),
          ),
        )
        .orderBy(...transactionDateOrder("desc"))
        .limit(5);

      return {
        id: card.id,
        name: card.name,
        invoiceCents,
        invoiceRef: currentCycleRef ?? undefined,
        dueDay: card.dueDay,
        availableLimitCents,
        totalLimitCents: card.creditLimitCents,
        recentPurchases,
      };
    }),
  );

  return formatCardSummary(cardSummaries);
}
