import { and, eq, gte, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramDeliveries, telegramLinks, telegramPreferences, transactions, users } from "@/db/schema";
import { getNowInSaoPaulo, todayRef } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getBalances } from "@/server/queries";
import { calculateDailyBudget } from "@/lib/daily-budget";
import { loadCardSummariesData, sanitizeCardName, type CardSummaryData } from "./card-summary";
import { enrichAndFilterProactiveAlerts } from "./alerts";
import { loadInsightData } from "./insight-data";
import { type InsightData, type InsightWindow, type Preferences } from "./insights";

export interface YesterdayMovements {
  incomeCents: number;
  expenseCents: number;
  hasMovements: boolean;
}

export interface DailySummaryData {
  dayLabel: string;
  accounts: {
    totalAvailableCents: number;
    incomplete?: boolean;
  };
  yesterdayMovements: YesterdayMovements;
  cards: CardSummaryData[];
  insights: string[];
}

function formatCurrency(cents: number): string {
  return formatCents(cents).replace(/\u00A0/g, " ");
}

function sanitizeLabel(name: string): string {
  return name.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").slice(0, 50);
}

/**
 * Formata a mensagem consolidada do resumo diário das 08:00 BRT
 * (1) CONTA: saldo total + entradas/saídas de D-1
 * (2) CARTÃO: fatura, limite usado/disponível, vencimento
 * (3) INSIGHTS: 2-3 insights relevantes do dia
 */
export function formatDailySummary(data: DailySummaryData): string {
  const sections: string[] = [];

  // Cabeçalho
  sections.push(`🌅 *Mutano Contas — Resumo do Dia (${data.dayLabel})*`);

  // (1) CONTA
  const accountLines: string[] = ["💰 *CONTA*"];
  const totalStr = formatCurrency(data.accounts.totalAvailableCents);
  accountLines.push(`• Saldo total disponível: ${totalStr}${data.accounts.incomplete ? " (parcial)" : ""}`);

  if (data.yesterdayMovements.hasMovements) {
    const inc = formatCurrency(data.yesterdayMovements.incomeCents);
    const exp = formatCurrency(data.yesterdayMovements.expenseCents);
    accountLines.push(`• Ontem: entradas ${inc} · saídas ${exp}`);
  } else {
    accountLines.push("• Ontem: sem movimentações registradas");
  }
  sections.push(accountLines.join("\n"));

  // (2) CARTÃO
  const cardLines: string[] = ["💳 *CARTÃO*"];
  if (data.cards.length === 0) {
    cardLines.push("• Nenhum cartão de crédito cadastrado");
  } else {
    for (const card of data.cards.slice(0, 5)) {
      const name = sanitizeCardName(card.name);
      const invoice = formatCurrency(card.invoiceCents);

      let limitText = "";
      if (card.availableLimitCents !== null && card.availableLimitCents !== undefined) {
        const avail = formatCurrency(card.availableLimitCents);
        if (card.totalLimitCents !== null && card.totalLimitCents !== undefined && card.totalLimitCents > 0) {
          const used = formatCurrency(Math.max(0, card.totalLimitCents - card.availableLimitCents));
          limitText = ` · Limite: ${used} usado / ${avail} disponível`;
        } else {
          limitText = ` · Limite disponível: ${avail}`;
        }
      }

      const dueText = card.dueDay ? ` · Vence dia ${card.dueDay}` : "";
      cardLines.push(`• *${name}*: Fatura ${invoice}${limitText}${dueText}`);
    }
  }
  sections.push(cardLines.join("\n"));

  // (3) INSIGHTS DO DIA (2 a 3 itens)
  const insightLines: string[] = ["💡 *INSIGHTS DO DIA*"];
  if (data.insights.length === 0) {
    insightLines.push("• Suas contas e limites estão em dia para hoje.");
  } else {
    for (const item of data.insights.slice(0, 3)) {
      insightLines.push(`• ${item}`);
    }
  }
  sections.push(insightLines.join("\n"));

  // Rodapé
  sections.push("_/pausar para pausar avisos automáticos_");

  return sections.join("\n\n").slice(0, 3800);
}

/**
 * Coleta as entradas e saídas do dia anterior (D-1 civil em São Paulo)
 */
export async function loadYesterdayMovements(
  userId: string,
  now: Date,
  connection: Pick<typeof db, "select"> = db,
): Promise<YesterdayMovements> {
  const spNow = getNowInSaoPaulo(now);
  const yesterday = new Date(spNow.getFullYear(), spNow.getMonth(), spNow.getDate() - 1);
  const yYear = yesterday.getFullYear();
  const yMonth = yesterday.getMonth();
  const yDay = yesterday.getDate();

  // Em São Paulo (UTC-3), o dia civil cobre de 03:00 UTC do dia até 03:00 UTC do dia seguinte
  const start = new Date(Date.UTC(yYear, yMonth, yDay, 3, 0, 0));
  const end = new Date(Date.UTC(yYear, yMonth, yDay + 1, 3, 0, 0));

  const rows = await connection
    .select({
      kind: transactions.kind,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isTransfer, false),
        eq(transactions.isCardPayment, false),
        or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED")),
        gte(transactions.date, start),
        lt(transactions.date, end),
      ),
    )
    .groupBy(transactions.kind);

  const incomeCents = Number(rows.find((r) => r.kind === "INCOME")?.total ?? 0);
  const expenseCents = Number(rows.find((r) => r.kind === "EXPENSE")?.total ?? 0);

  return {
    incomeCents,
    expenseCents,
    hasMovements: incomeCents > 0 || expenseCents > 0,
  };
}

/**
 * Seleciona de 2 a 3 insights prioritários para compor o bloco de insights
 */
export function selectDailyInsights(
  data: InsightData,
  dailyBudgetCents?: number,
): string[] {
  const list: string[] = [];

  // 1. Contas a pagar vencendo hoje ou amanhã
  if (data.due?.length) {
    for (const b of data.due) {
      if (b.diffDays === 0) {
        list.push(`Conta a vencer hoje: ${sanitizeLabel(b.name)} (${formatCurrency(b.totalCents)})`);
      } else if (b.diffDays === 1) {
        list.push(`Conta a vencer amanhã: ${sanitizeLabel(b.name)} (${formatCurrency(b.totalCents)})`);
      }
      if (list.length >= 3) return list;
    }
  }

  // 2. Faturas de cartão vencendo em até 3 dias
  if (data.cardInvoices?.length) {
    for (const c of data.cardInvoices) {
      if (c.diffDays === 0) {
        list.push(`Fatura do ${sanitizeLabel(c.cardName)} vence hoje (${formatCurrency(c.invoiceCents)})`);
      } else if (c.diffDays === 1) {
        list.push(`Fatura do ${sanitizeLabel(c.cardName)} vence amanhã (${formatCurrency(c.invoiceCents)})`);
      } else if (c.diffDays === 3) {
        list.push(`Fatura do ${sanitizeLabel(c.cardName)} vence em 3 dias (${formatCurrency(c.invoiceCents)})`);
      }
      if (list.length >= 3) return list;
    }
  }

  // 3. Orçamento estourado (100%+) ou no limite de alerta (80%+)
  if (data.budgets?.length) {
    const exceeded = data.budgets.filter((b) => b.spentCents >= b.limitCents && b.limitCents > 0);
    for (const b of exceeded) {
      const pct = b.pct ?? Math.round((b.spentCents / b.limitCents) * 100);
      list.push(`Orçamento estourado em ${sanitizeLabel(b.name)}: ${formatCurrency(b.spentCents)} de ${formatCurrency(b.limitCents)} (${pct}%)`);
      if (list.length >= 3) return list;
    }

    const warning = data.budgets.filter((b) => b.spentCents >= Math.round(b.limitCents * 0.8) && b.spentCents < b.limitCents && b.limitCents > 0);
    for (const b of warning) {
      const pct = b.pct ?? Math.round((b.spentCents / b.limitCents) * 100);
      list.push(`Atenção: orçamento de ${sanitizeLabel(b.name)} atingiu ${pct}% (${formatCurrency(b.spentCents)} de ${formatCurrency(b.limitCents)})`);
      if (list.length >= 3) return list;
    }
  }

  // 4. Previsão de saldo negativo para o fim do mês
  if (data.forecast && data.forecast.balanceCents < 0) {
    list.push(`Previsão de saldo negativo para o fim do mês: ${formatCurrency(data.forecast.balanceCents)} no ritmo atual`);
    if (list.length >= 3) return list;
  }

  // 5. Aumento de preço de assinaturas
  if (data.subscriptions?.length) {
    const hikes = data.subscriptions.filter((s) => s.hasPriceIncrease);
    for (const s of hikes) {
      list.push(`Aviso de assinatura: ${sanitizeLabel(s.name)} subiu para ${formatCurrency(s.currentCents)} (+${s.priceIncreasePct}%)`);
      if (list.length >= 3) return list;
    }
  }

  // 6. Gasto acima da média ontem em alguma categoria
  if (data.categories?.length) {
    const elevated = data.categories.filter((c) => c.todayCents > (c.historyCents / 30) * 1.5 && c.todayCents >= 1000);
    for (const c of elevated) {
      list.push(`Gasto recente acima da média em ${sanitizeLabel(c.name)}: ${formatCurrency(c.todayCents)}`);
      if (list.length >= 3) return list;
    }
  }

  // 7. Cota de gasto diário recomendado para hoje (se houver e ainda couber)
  if (list.length < 3 && dailyBudgetCents !== undefined && dailyBudgetCents > 0) {
    list.push(`Cota de hoje: você pode gastar até ${formatCurrency(dailyBudgetCents)} para fechar o mês no azul`);
  }

  return list.slice(0, 3);
}

/**
 * Carrega todos os dados do resumo diário para um usuário
 */
export async function loadDailySummaryData(
  userId: string,
  now: Date = new Date(),
  connection: typeof db = db,
): Promise<DailySummaryData> {
  const spNow = getNowInSaoPaulo(now);
  const day = String(spNow.getDate()).padStart(2, "0");
  const month = String(spNow.getMonth() + 1).padStart(2, "0");
  const dayLabel = `${day}/${month}`;
  const dayRefStr = todayRef(now);

  const window: InsightWindow = {
    key: `${dayRefStr}:8`,
    day: dayRefStr,
    hour: 8,
  };

  // 1. Balanço das contas e movimentações de ontem
  const [balances, yesterdayMovements, cards, rawInsightData, [user]] = await Promise.all([
    getBalances(userId, connection),
    loadYesterdayMovements(userId, now, connection),
    loadCardSummariesData(userId, connection, now),
    loadInsightData(userId, window, connection),
    connection.select({ monthlyIncomeCents: users.monthlyIncomeCents }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  // 2. Alertas proativos e enriquecimento
  const enrichedInsightData = await enrichAndFilterProactiveAlerts(userId, rawInsightData, window, connection);

  // 3. Cálculo de cota diária (se possível)
  let dailyBudgetCents: number | undefined;
  try {
    const daysInMonth = new Date(spNow.getFullYear(), spNow.getMonth() + 1, 0).getDate();
    const dayOfMonth = spNow.getDate();
    const incomeCents = Number(user?.monthlyIncomeCents ?? rawInsightData.incomeCents ?? 0);
    if (incomeCents > 0) {
      const budget = calculateDailyBudget({
        incomeCents,
        expenseSoFarCents: rawInsightData.expenseCents,
        dayOfMonth,
        daysInMonth,
      });
      dailyBudgetCents = budget.dailyAllowanceCents;
    }
  } catch {
    // Cálculo de orçamento diário não bloqueia o resumo
  }

  const insights = selectDailyInsights(enrichedInsightData, dailyBudgetCents);

  return {
    dayLabel,
    accounts: {
      totalAvailableCents: balances.availableCents,
      incomplete: balances.totalIncomplete,
    },
    yesterdayMovements,
    cards,
    insights,
  };
}

/**
 * Renderiza o texto final do resumo diário para o usuário
 */
export async function renderDailySummary(
  userId: string,
  connection: typeof db = db,
  now: Date = new Date(),
): Promise<string> {
  const data = await loadDailySummaryData(userId, now, connection);
  return formatDailySummary(data);
}

/**
 * Calcula a janela do resumo diário para idempotência atômica.
 * Chave de 13 caracteres: `${day}:ds` (ex: `2026-11-11:ds`), cabe em varchar(13).
 */
export function dailySummaryWindow(now: Date = new Date()): { key: string; day: string } | null {
  const hour = getNowInSaoPaulo(now).getHours();
  // Janela das 08h às 21h em São Paulo (não envia de madrugada)
  if (hour < 8 || hour > 21) return null;
  const day = todayRef(now);
  return { key: `${day}:ds`, day };
}

export interface DailySummaryRecipient {
  userId: string;
  chatId: string;
  prefs: Preferences;
}

export interface DailySummaryDependencies {
  candidates(windowKey: string, afterUserId?: string): Promise<DailySummaryRecipient[]>;
  render(userId: string, now: Date): Promise<string>;
  claim(userId: string, windowKey: string): Promise<boolean>;
  send(chatId: string, text: string): Promise<void>;
  finish(userId: string, windowKey: string, status: "SENT" | "FAILED" | "CANCELLED"): Promise<void>;
}

export const dailySummaryDependencies: DailySummaryDependencies = {
  async candidates(windowKey: string, afterUserId?: string) {
    const rows = await db
      .select({
        userId: telegramLinks.userId,
        chatId: telegramLinks.chatId,
        prefs: telegramPreferences,
      })
      .from(telegramLinks)
      .innerJoin(telegramPreferences, eq(telegramPreferences.userId, telegramLinks.userId))
      .where(
        and(
          afterUserId ? sql`${telegramLinks.userId} > ${afterUserId}` : undefined,
          eq(telegramPreferences.enabled, true),
          eq(telegramPreferences.summary, true),
          notExists(
            db
              .select({ id: telegramDeliveries.id })
              .from(telegramDeliveries)
              .where(
                and(
                  eq(telegramDeliveries.userId, telegramLinks.userId),
                  eq(telegramDeliveries.windowKey, windowKey),
                ),
              ),
          ),
        ),
      )
      .orderBy(telegramLinks.userId)
      .limit(100);

    return rows.map((r) => ({
      ...r,
      prefs: {
        ...r.prefs,
        hours: r.prefs.hours as Preferences["hours"],
      },
    }));
  },
  render: (userId: string, now: Date) => renderDailySummary(userId, db, now),
  async claim(userId: string, windowKey: string): Promise<boolean> {
    const [row] = await db
      .insert(telegramDeliveries)
      .values({ userId, windowKey })
      .onConflictDoNothing()
      .returning({ id: telegramDeliveries.id });
    return Boolean(row);
  },
  async send(chatId: string, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("telegram_unavailable");
    const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, protect_content: true }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const body: unknown = await result.json();
    if (!result.ok || !(body as { ok?: boolean })?.ok) throw new Error("telegram_send_failed");
  },
  async finish(userId: string, windowKey: string, status: "SENT" | "FAILED" | "CANCELLED"): Promise<void> {
    await db
      .update(telegramDeliveries)
      .set({ status })
      .where(
        and(
          eq(telegramDeliveries.userId, userId),
          eq(telegramDeliveries.windowKey, windowKey),
        ),
      );
  },
};

/**
 * Processa a entrega do resumo diário para os usuários em lotes
 */
export async function runDailySummaryBatch(
  window: { key: string; day: string },
  deps: DailySummaryDependencies = dailySummaryDependencies,
  now: Date = new Date(),
) {
  const result = { sent: 0, skipped: 0, failed: 0 };
  const started = Date.now();
  let afterUserId: string | undefined;

  while (true) {
    const recipients = await deps.candidates(window.key, afterUserId);
    if (!recipients.length) break;

    for (let offset = 0; offset < recipients.length; offset += 5) {
      if (Date.now() - started > 240_000) return { ...result, remaining: true };

      await Promise.all(
        recipients.slice(offset, offset + 5).map(async (recipient) => {
          let claimed = false;
          try {
            // Opt-out verificado
            if (!recipient.prefs.enabled || !recipient.prefs.summary) {
              result.skipped++;
              return;
            }

            // Reserva atômica de entrega (idempotência)
            if (!(await deps.claim(recipient.userId, window.key))) {
              result.skipped++;
              return;
            }
            claimed = true;

            const text = await deps.render(recipient.userId, now);
            if (!text) {
              await deps.finish(recipient.userId, window.key, "CANCELLED");
              result.skipped++;
              return;
            }

            await deps.send(recipient.chatId, text);
            await deps.finish(recipient.userId, window.key, "SENT");
            result.sent++;
          } catch {
            result.failed++;
            if (claimed) {
              try {
                await deps.finish(recipient.userId, window.key, "FAILED");
              } catch {
                // Preserva claim para evitar reenvio em caso de status incerto
              }
            }
          }
        }),
      );
    }

    if (recipients.length < 100) break;
    afterUserId = recipients[recipients.length - 1].userId;
  }

  return result;
}
