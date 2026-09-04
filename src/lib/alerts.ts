import { formatCents } from "./money";
import { formatDate } from "./dates";

export type AlertTone = "warn" | "info";

export type Alert = {
  id: string;
  tone: AlertTone;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

type BudgetAlertInput = {
  categoryId: string;
  name: string;
  limitCents: number | null;
  spentCents: number;
  remainingCents: number;
  status: string;
};

/**
 * Central de avisos do Painel: só dentro do app (sem e-mail nem push, por
 * enquanto — decisão explícita, não esquecimento). Cada função aqui é pura
 * e só olha para dados já carregados pela página, então dá para testar sem
 * banco e sem reimplementar a mesma regra em outro lugar.
 */
export function buildBudgetAlerts(rows: BudgetAlertInput[]): Alert[] {
  return rows
    .filter((r) => r.status === "estourou")
    .map((r) => ({
      id: `budget-${r.categoryId}`,
      tone: "warn",
      title: `Orçamento de "${r.name}" estourou`,
      description: `Gasto de ${formatCents(r.spentCents)} passou o limite de ${formatCents(r.limitCents ?? 0)} em ${formatCents(Math.abs(r.remainingCents))}.`,
      href: "/orcamento",
      linkLabel: "Ver orçamento",
    }));
}

type GoalAlertInput = {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  targetDate: Date | null;
  archived: boolean;
};

export function buildGoalAlerts(goals: GoalAlertInput[], now = new Date()): Alert[] {
  return goals
    .filter((g) => !g.archived && g.targetDate && g.targetDate.getTime() < now.getTime() && g.savedCents < g.targetCents)
    .map((g) => ({
      id: `goal-${g.id}`,
      tone: "warn",
      title: `Meta "${g.name}" passou do prazo`,
      description: `Prazo era ${formatDate(g.targetDate as Date)} e ainda falta${g.targetCents - g.savedCents === 1 ? "" : "m"} ${formatCents(g.targetCents - g.savedCents)}.`,
      href: "/metas",
      linkLabel: "Ver metas",
    }));
}
