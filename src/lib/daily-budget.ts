import { formatCents } from "./money";

export type DailyBudgetInput = {
  incomeCents: number;
  expenseSoFarCents: number;
  spentTodayCents?: number;
  dayOfMonth: number;
  daysInMonth: number;
};

export type DailyBudgetResult = {
  dailyAllowanceCents: number;
  remainingTodayCents: number;
  availableForRestOfMonthCents: number;
  daysRemainingWithToday: number;
  status: "ok" | "tight" | "exceeded";
};

/**
 * Calcula quanto o usuário pode gastar por dia no restante do mês
 * para não ultrapassar a renda ou orçamento mensal.
 */
export function calculateDailyBudget({
  incomeCents,
  expenseSoFarCents,
  spentTodayCents = 0,
  dayOfMonth,
  daysInMonth,
}: DailyBudgetInput): DailyBudgetResult {
  const safeDaysInMonth = Math.max(1, daysInMonth);
  const clampedDay = Math.min(safeDaysInMonth, Math.max(1, dayOfMonth));
  const daysRemainingWithToday = Math.max(1, safeDaysInMonth - clampedDay + 1);

  const availableForRestOfMonthCents = incomeCents - expenseSoFarCents;

  if (availableForRestOfMonthCents <= 0) {
    return {
      dailyAllowanceCents: 0,
      remainingTodayCents: 0,
      availableForRestOfMonthCents,
      daysRemainingWithToday,
      status: "exceeded",
    };
  }

  const dailyAllowanceCents = Math.round(availableForRestOfMonthCents / daysRemainingWithToday);
  const remainingTodayCents = Math.max(0, dailyAllowanceCents - spentTodayCents);

  const status: "ok" | "tight" | "exceeded" =
    dailyAllowanceCents < 2000 ? "tight" : "ok"; // menos de R$ 20/dia é considerado apertado

  return {
    dailyAllowanceCents,
    remainingTodayCents,
    availableForRestOfMonthCents,
    daysRemainingWithToday,
    status,
  };
}

/**
 * Formata o resumo do orçamento diário para o comando /hoje no bot do Telegram.
 */
export function formatDailyBudgetSummary(budget: DailyBudgetResult): string {
  if (budget.status === "exceeded") {
    const deficit = formatCents(Math.abs(budget.availableForRestOfMonthCents));
    return (
      `Atenção: seus gastos já ultrapassaram a renda prevista em ${deficit} neste mês. ` +
      `Para fechar o mês com equilíbrio, evite novas despesas até o próximo ciclo.`
    );
  }

  const allowance = formatCents(budget.dailyAllowanceCents);
  const remainingToday = formatCents(budget.remainingTodayCents);
  const totalLeft = formatCents(budget.availableForRestOfMonthCents);
  const days = budget.daysRemainingWithToday;

  return (
    `Hoje você pode gastar até ${remainingToday} ` +
    `(meta de ${allowance}/dia com base em ${totalLeft} disponíveis para os ${days} dias restantes no mês).`
  );
}
