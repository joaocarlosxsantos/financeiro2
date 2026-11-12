import { formatCents } from "@/lib/money";
import { safeLabel } from "./ai-policy";
import type { InsightData, Preferences } from "./insights";

const money = (cents: number) => formatCents(cents).replace(/\u00a0/g, " ");
const label = (value: string) => safeLabel(value).replaceAll("/", " ").replace(/(?:\d[ -]?){6,}\d/g,
  digits => `final ${digits.replace(/\D/g, "").slice(-4)}`).replace(/\s+/g, " ").trim().slice(0, 35);

/** Each alert is plain text, one short line, with an action; at most three per delivery. */
export function proactiveLines(data: InsightData, prefs: Preferences): string[] {
  const lines: string[] = [];
  if (data.syncProblem) lines.push("Sincronização com problema. Confira Conexões no app.");
  if (prefs.dueBills) for (const bill of data.due.slice(0, 3)) {
    const when = bill.diffDays === 0 ? "hoje" : bill.diffDays === 1 ? "amanhã" : bill.date;
    if (Number.isFinite(bill.totalCents) && bill.totalCents > 0) lines.push(`Conta vence ${when}: ${label(bill.name)}, ${money(bill.totalCents)}. Veja no app.`);
  }
  if (prefs.cardInvoice) {
    for (const card of data.cardClosings ?? []) {
      if (card.diffDays === 0 || card.diffDays === 1) lines.push(`Fatura ${label(card.cardName)} fecha ${card.diffDays === 0 ? "hoje" : "amanhã"}. Veja /cartao.`);
    }
    for (const card of data.cardInvoices ?? []) {
      const when = card.diffDays === 0 ? "hoje" : card.diffDays === 1 ? "amanhã" : card.diffDays === 3 ? "em 3 dias" : null;
      if (when && card.invoiceCents > 0) lines.push(`Fatura ${label(card.cardName)} vence ${when}: ${money(card.invoiceCents)}. Veja /cartao.`);
    }
  }
  if (prefs.negativeForecast && !data.syncProblem) {
    if (data.cashBalanceCents !== undefined && Number.isFinite(data.cashBalanceCents) && data.cashBalanceCents <= 0)
      lines.push(`Saldo disponível ${data.cashBalanceCents < 0 ? "negativo" : "zerado"}: ${money(data.cashBalanceCents)}. Confira /saldo.`);
    else if (data.forecast && Number.isFinite(data.forecast.balanceCents) && data.forecast.balanceCents < 0)
      lines.push(`Saldo previsto negativo: ${money(data.forecast.balanceCents)}. Confira /previsao.`);
  }
  if (prefs.spending) {
    const elevated = data.categories.filter(c => c.historyCount >= 5 && c.historyDays >= 3 && c.historyCents > 0
      && c.todayCents > c.historyCents / 30 * 1.5 && c.todayCents - c.historyCents / 30 >= 1000)
      .sort((a, b) => b.todayCents - a.todayCents);
    for (const c of elevated) lines.push(`Gasto acima do usual em ${label(c.name)}: ${money(c.todayCents)}. Veja /relatorio.`);
    for (const sub of data.subscriptions ?? []) if (sub.hasPriceIncrease)
      lines.push(`Assinatura ${label(sub.name)} subiu para ${money(sub.currentCents)}. Confira /assinaturas.`);
  }
  if (prefs.budget) for (const b of data.budgets) {
    if (b.limitCents > 0 && b.spentCents >= Math.round(b.limitCents * 0.8)) {
      const percent = Math.round(b.spentCents / b.limitCents * 100);
      lines.push(`Orçamento ${b.spentCents >= b.limitCents ? "estourou" : "em alerta"}: ${label(b.name)}, ${percent}%. Confira no app.`);
    }
  }
  return lines.slice(0, 3);
}
