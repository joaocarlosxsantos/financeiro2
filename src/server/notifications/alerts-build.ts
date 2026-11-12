import { formatCents } from "@/lib/money";
import { safeLabel } from "@/server/telegram/ai-policy";
import { eventSchema, type NotificationEvent } from "./policy";

/** Teto por usuário e dia: evita tempestade de pushes quando há muitas contas/eixos estourados. */
export const MAX_ALERT_EVENTS = 8;

export interface AlertBillFact {
  id: string;
  name: string;
  totalCents: number;
  dueDate: string;
  /** -1 = venceu ontem, 0 = vence hoje, 3 = vence em três dias. */
  diffDays: number;
}
export interface AlertCardFact {
  id: string;
  cardName: string;
  /** Valor da fatura quando houver; ausente no fechamento. */
  invoiceCents?: number;
  date: string;
  diffDays: number;
}
export interface AlertBudgetFact {
  id: string;
  name: string;
  spentCents: number;
  limitCents: number;
}
export interface AlertGoalFact {
  id: string;
  name: string;
  savedCents: number;
  targetCents: number;
  /** Data civil (YYYY-MM-DD) do prazo, ou null quando a meta não tem data. */
  targetDate: string | null;
}
export interface AlertFacts {
  bills: AlertBillFact[];
  cardsDue: AlertCardFact[];
  cardsClosing: AlertCardFact[];
  budgets: AlertBudgetFact[];
  goals: AlertGoalFact[];
  syncProblem: boolean;
}

const money = (cents: number) => formatCents(cents).replace(/\u00a0/g, " ");
/** Nomes vêm do usuário: remove links/segredos, controles e excesso de tamanho. */
const label = (value: string) => safeLabel(value).replaceAll("/", " ").replace(/\s+/g, " ").trim().slice(0, 40) || "sem nome";
const percent = (spentCents: number, limitCents: number) => Math.round((spentCents / Math.max(limitCents, 1)) * 100);
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function billEvent(userId: string, bill: AlertBillFact): NotificationEvent {
  const name = label(bill.name), value = bill.totalCents > 0 ? ` (${money(bill.totalCents)})` : "";
  const [type, body] = bill.diffDays === -1
    ? ["BILL_OVERDUE_D1", `Atenção: ${name}${value} venceu ontem e segue pendente.`]
    : bill.diffDays === 0
      ? ["DUE_BILL_TODAY", `Conta vence hoje: ${name}${value}. Não esqueça de pagar.`]
      : ["DUE_BILL_D3", `Conta a vencer em 3 dias: ${name}${value}. Planeje o saldo.`];
  return eventSchema.parse({ userId, category: "dueBills", type, body, actionUrl: "/contas-a-pagar", dedupeKey: `bill:${bill.id}:${type}:${bill.dueDate}` });
}

function cardDueEvent(userId: string, card: AlertCardFact): NotificationEvent {
  const when = card.diffDays === 0 ? "hoje" : card.diffDays === 1 ? "amanhã" : "em 3 dias";
  const value = card.invoiceCents && card.invoiceCents > 0 ? `: ${money(card.invoiceCents)}` : "";
  return eventSchema.parse({ userId, category: "cardInvoice", type: "CARD_INVOICE_DUE",
    body: `Fatura ${label(card.cardName)} vence ${when}${value}.`, actionUrl: "/contas",
    dedupeKey: `card:${card.id}:due:${card.date}` });
}

function cardClosingEvent(userId: string, card: AlertCardFact): NotificationEvent {
  return eventSchema.parse({ userId, category: "cardInvoice", type: "CARD_INVOICE_CLOSING",
    body: `Fatura ${label(card.cardName)} fecha ${card.diffDays === 0 ? "hoje" : "amanhã"}. Confira o valor consolidado.`,
    actionUrl: "/contas", dedupeKey: `card:${card.id}:closing:${card.date}` });
}

/** Alertas deterministas: mesma ocorrência gera a mesma dedupeKey e nunca repete. */
export function buildAlertEvents(userId: string, facts: AlertFacts, day: string): NotificationEvent[] {
  const month = day.slice(0, 7);

  const bills = facts.bills.map((bill) => ({ bill, event: billEvent(userId, bill) }));
  const overdue = bills.filter(({ bill }) => bill.diffDays === -1).map(({ event }) => event);
  const dueToday = bills.filter(({ bill }) => bill.diffDays === 0).map(({ event }) => event);
  const dueIn3 = bills.filter(({ bill }) => bill.diffDays === 3).map(({ event }) => event);

  const cardsDue = facts.cardsDue.map((card) => ({ card, event: cardDueEvent(userId, card) }));
  const cardsClosing = facts.cardsClosing.map((card) => ({ card, event: cardClosingEvent(userId, card) }));
  const cardsDueToday = cardsDue.filter(({ card }) => card.diffDays === 0).map(({ event }) => event);
  const cardsDueTomorrow = cardsDue.filter(({ card }) => card.diffDays === 1).map(({ event }) => event);
  const cardsDueIn3 = cardsDue.filter(({ card }) => card.diffDays === 3).map(({ event }) => event);
  const closingToday = cardsClosing.filter(({ card }) => card.diffDays === 0).map(({ event }) => event);
  const closingTomorrow = cardsClosing.filter(({ card }) => card.diffDays === 1).map(({ event }) => event);

  const exceeded: NotificationEvent[] = [], warning: NotificationEvent[] = [];
  for (const budget of facts.budgets) {
    if (budget.limitCents <= 0) continue;
    const pct = percent(budget.spentCents, budget.limitCents);
    const name = label(budget.name), values = `${money(budget.spentCents)} de ${money(budget.limitCents)}`;
    if (budget.spentCents >= budget.limitCents) {
      exceeded.push(eventSchema.parse({ userId, category: "budget", type: "BUDGET_EXCEEDED",
        body: `Orçamento estourado: ${name}, ${pct}% (${values}).`, actionUrl: "/orcamento",
        dedupeKey: `budget:${budget.id}:100:${month}` }));
    } else if (budget.spentCents >= Math.round(budget.limitCents * 0.8)) {
      warning.push(eventSchema.parse({ userId, category: "budget", type: "BUDGET_WARNING_80",
        body: `Orçamento em alerta: ${name}, ${pct}% (${values}).`, actionUrl: "/orcamento",
        dedupeKey: `budget:${budget.id}:80:${month}` }));
    }
  }

  const goalsReached: NotificationEvent[] = [], goalsLate: NotificationEvent[] = [];
  for (const goal of facts.goals) {
    if (goal.targetCents <= 0) continue;
    const name = label(goal.name), pct = percent(goal.savedCents, goal.targetCents);
    if (goal.savedCents >= goal.targetCents) {
      goalsReached.push(eventSchema.parse({ userId, category: "goals", type: "GOAL_REACHED",
        body: `🎉 Meta atingida: ${name} chegou a ${pct}% (${money(goal.savedCents)} de ${money(goal.targetCents)}).`,
        actionUrl: "/metas", dedupeKey: `goal:${goal.id}:reached` }));
    } else if (goal.targetDate && goal.targetDate < day) {
      goalsLate.push(eventSchema.parse({ userId, category: "goals", type: "GOAL_LATE",
        body: `Meta atrasada: ${name}, ${pct}% concluída; o prazo era ${brDate(goal.targetDate)}.`,
        actionUrl: "/metas", dedupeKey: `goal:${goal.id}:late:${goal.targetDate}` }));
    }
  }

  const sync = facts.syncProblem
    ? [eventSchema.parse({ userId, category: "syncAlerts", type: "SYNC_PROBLEM",
      body: "Sincronização com o banco com problema. Confira Conexões no app.", actionUrl: "/configuracoes/integracao",
      dedupeKey: `sync:${day}` })]
    : [];

  // Urgência primeiro; o teto diário corta o excedente sem repetir nada no dia seguinte.
  return [...sync, ...overdue, ...dueToday, ...cardsDueToday, ...closingToday, ...exceeded,
    ...dueIn3, ...cardsDueTomorrow, ...cardsDueIn3, ...closingTomorrow, ...warning, ...goalsLate, ...goalsReached]
    .slice(0, MAX_ALERT_EVENTS);
}
