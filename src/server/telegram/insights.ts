import { z } from "zod";
import { getNowInSaoPaulo, todayRef } from "@/lib/dates";

export const preferenceSchema = z.object({
  enabled: z.boolean(),
  hours: z.array(z.union([z.literal(8), z.literal(14), z.literal(20)])).min(1).max(3)
    .refine((hours) => new Set(hours).size === hours.length),
  summary: z.boolean(), spending: z.boolean(), dueBills: z.boolean(), budget: z.boolean(),
}).strict();
export type Preferences = z.infer<typeof preferenceSchema>;
export const DEFAULT_PREFERENCES: Preferences = { enabled: false, hours: [8, 14, 20], summary: true, spending: true, dueBills: true, budget: true };
export type InsightWindow = { key: string; day: string; hour: 8 | 14 | 20; monthly?: true };

export function insightWindow(now = new Date()): InsightWindow | null {
  const hour = getNowInSaoPaulo(now).getHours();
  if (hour < 8) return null;
  const slot = hour >= 20 ? 20 : hour >= 14 ? 14 : 8;
  const day = todayRef(now);
  return { key: `${day}:${slot}`, day, hour: slot };
}

export function dayDate(day: string, offset = 0): Date {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

export type InsightData = {
  summaryDay: string;
  incomeCents: number;
  expenseCents: number;
  categories: { name: string; todayCents: number; historyCents: number; historyCount: number; historyDays: number }[];
  due: { name: string; date: string; totalCents: number }[];
  budgets: { name: string; spentCents: number; limitCents: number }[];
  subscriptions?: {
    name: string;
    currentCents: number;
    previousCents?: number;
    hasPriceIncrease: boolean;
    priceIncreasePct?: number;
    isRegistered: boolean;
  }[];
};
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const label = (name: string) => name.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").slice(0, 60);

export function buildInsight(data: InsightData, prefs: Preferences, window: InsightWindow, manual = false): string | null {
  const lines: string[] = [];
  if (prefs.summary && (manual || window.hour !== 14)) {
    lines.push(`Resumo de ${data.summaryDay}: entradas ${money(data.incomeCents)}, gastos ${money(data.expenseCents)}, diferença ${money(data.incomeCents - data.expenseCents)}.`);
  }
  if (prefs.spending && (manual || window.hour === 14)) {
    const categories = data.categories.filter((c) => c.historyCount >= 5 && c.historyDays >= 3 &&
      c.todayCents > c.historyCents / 30 * 1.5 && c.todayCents - c.historyCents / 30 >= 1000)
      .sort((a, b) => b.todayCents - a.todayCents).slice(0, 3);
    for (const c of categories) lines.push(`Gasto acima da média em ${label(c.name)}: hoje ${money(c.todayCents)}; média diária nos 30 dias anteriores ${money(Math.round(c.historyCents / 30))}.`);
  }
  if (prefs.dueBills) {
    for (const bill of data.due.slice(0, 3)) lines.push(`Conta a vencer em ${bill.date}: ${label(bill.name)}, ${money(bill.totalCents)} (total da conta).`);
  }
  if (prefs.budget) {
    const budgets = data.budgets.filter((b) => b.spentCents > b.limitCents && b.limitCents >= 0)
      .sort((a, b) => (b.spentCents - b.limitCents) - (a.spentCents - a.limitCents)).slice(0, 3);
    for (const b of budgets) lines.push(`Orçamento estourou em ${label(b.name)}: ${money(b.spentCents)} de ${money(b.limitCents)}.`);
  }
  if (data.subscriptions?.length) {
    const increases = data.subscriptions.filter((s) => s.hasPriceIncrease);
    for (const sub of increases.slice(0, 2)) {
      lines.push(
        `Aviso de assinatura: ${label(sub.name)} subiu de ${money(sub.previousCents ?? 0)} para ${money(sub.currentCents)} (+${sub.priceIncreasePct}%).`,
      );
    }
    const unregistered = data.subscriptions.filter((s) => !s.isRegistered && !s.hasPriceIncrease);
    for (const sub of unregistered.slice(0, 2)) {
      lines.push(
        `Assinatura detectada no extrato: ${label(sub.name)} (${money(sub.currentCents)}/mês). Registre em Recorrentes no app.`,
      );
    }
  }
  if (!lines.length) return null;
  return [`Mutano Contas — ${manual ? "resumo solicitado" : window.hour === 8 ? "resumo da manhã" : window.hour === 14 ? "alertas da tarde" : "fechamento do dia"}`, ...lines, "Dados registrados no app. /pausar desliga avisos automáticos."].join("\n").slice(0, 3800);
}
