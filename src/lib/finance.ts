/**
 * Regras financeiras do sistema.
 * Tudo em centavos. Todas as funções são puras — dá para testar isolado.
 */

export type MonthSummary = {
  incomeCents: number;
  expenseCents: number;
  fixedCents: number;
  variableCents: number;
};

/** Sobra do mês (pode ser negativa). */
export function balanceCents(s: MonthSummary): number {
  return s.incomeCents - s.expenseCents;
}

/** % da renda que sobrou. É o número que mais importa no longo prazo. */
export function savingsRate(s: MonthSummary): number {
  if (s.incomeCents <= 0) return 0;
  return Math.round(((s.incomeCents - s.expenseCents) / s.incomeCents) * 1000) / 10;
}

/**
 * Reserva de emergência = custo de vida mensal x meses de cobertura.
 * Usamos o custo de vida real (média dos últimos meses), não a renda:
 * quem gasta pouco precisa de reserva menor.
 */
export function emergencyTargetCents(avgMonthlyCostCents: number, months: number): number {
  return Math.max(0, Math.round(avgMonthlyCostCents * months));
}

/** Quantos meses de custo de vida o usuário já tem guardado. */
export function monthsOfRunway(savedCents: number, avgMonthlyCostCents: number): number {
  if (avgMonthlyCostCents <= 0) return 0;
  return Math.round((savedCents / avgMonthlyCostCents) * 10) / 10;
}

export type Recommendation = {
  necessitiesCents: number; // 50% — moradia, comida, transporte, contas
  wantsCents: number; // 30% — lazer, assinaturas, extras
  futureCents: number; // 20% — reserva, investimentos, quitar dívida
};

/** Guia 50/30/20 aplicado à renda líquida. */
export function fiftyThirtyTwenty(incomeCents: number): Recommendation {
  return {
    necessitiesCents: Math.round(incomeCents * 0.5),
    wantsCents: Math.round(incomeCents * 0.3),
    futureCents: Math.round(incomeCents * 0.2),
  };
}

export type HealthInput = {
  savingsRatePct: number;
  runwayMonths: number;
  emergencyMonthsTarget: number;
  fixedShareOfIncomePct: number;
};

export type HealthResult = {
  score: number; // 0-100
  label: string;
  tone: "danger" | "warn" | "ok" | "great";
  parts: { label: string; score: number; max: number; hint: string }[];
};

/**
 * Nota de saúde financeira — didática de propósito: mostra as 3 partes
 * que compõem o número em vez de só cuspir um score mágico.
 */
export function financialHealth(input: HealthInput): HealthResult {
  const { savingsRatePct, runwayMonths, emergencyMonthsTarget, fixedShareOfIncomePct } = input;

  // 1) Taxa de economia (0-40): 20% ou mais = nota cheia.
  const saving = clamp(Math.round((savingsRatePct / 20) * 40), 0, 40);

  // 2) Reserva de emergência (0-35): atingir a meta = nota cheia.
  const target = Math.max(1, emergencyMonthsTarget);
  const reserve = clamp(Math.round((runwayMonths / target) * 35), 0, 35);

  // 3) Peso dos gastos fixos (0-25): até 50% da renda = nota cheia, 80%+ = zero.
  const fixed = clamp(Math.round(((80 - fixedShareOfIncomePct) / 30) * 25), 0, 25);

  const score = clamp(saving + reserve + fixed, 0, 100);

  const tone: HealthResult["tone"] =
    score >= 80 ? "great" : score >= 60 ? "ok" : score >= 35 ? "warn" : "danger";
  const label =
    score >= 80
      ? "Muito saudável"
      : score >= 60
        ? "No caminho certo"
        : score >= 35
          ? "Precisa de ajustes"
          : "Situação de alerta";

  return {
    score,
    label,
    tone,
    parts: [
      {
        label: "Quanto você guarda",
        score: saving,
        max: 40,
        hint: "Guardar 20% da renda todo mês já garante a nota cheia aqui.",
      },
      {
        label: "Reserva de emergência",
        score: reserve,
        max: 35,
        hint: `Nota cheia quando a reserva cobre ${target} ${target === 1 ? "mês" : "meses"} de custo de vida.`,
      },
      {
        label: "Peso dos gastos fixos",
        score: fixed,
        max: 25,
        hint: "Gastos fixos até 50% da renda deixam espaço para respirar.",
      },
    ],
  };
}

export type ProjectionPoint = {
  monthIndex: number;
  label: string;
  balanceCents: number;
};

export type ProjectionScenario = {
  key: string;
  name: string;
  description: string;
  monthlyContributionCents: number;
  annualReturnPct: number;
  points: ProjectionPoint[];
  finalCents: number;
};

/**
 * Projeção de juros compostos com aportes mensais.
 * saldo(n) = saldo(n-1) * (1 + i) + aporte
 */
export function projectBalance(
  startCents: number,
  monthlyContributionCents: number,
  annualReturnPct: number,
  months: number,
  labelFor: (i: number) => string,
): ProjectionPoint[] {
  const i = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const points: ProjectionPoint[] = [];
  let balance = startCents;
  for (let m = 0; m <= months; m++) {
    if (m > 0) balance = balance * (1 + i) + monthlyContributionCents;
    points.push({ monthIndex: m, label: labelFor(m), balanceCents: Math.round(balance) });
  }
  return points;
}

/** Meses necessários para alcançar um alvo com o aporte atual. */
export function monthsToTarget(
  startCents: number,
  monthlyContributionCents: number,
  annualReturnPct: number,
  targetCents: number,
  cap = 600,
): number | null {
  if (startCents >= targetCents) return 0;
  if (monthlyContributionCents <= 0 && annualReturnPct <= 0) return null;
  const i = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  let balance = startCents;
  for (let m = 1; m <= cap; m++) {
    balance = balance * (1 + i) + monthlyContributionCents;
    if (balance >= targetCents) return m;
  }
  return null;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// ------------------------------------------------------------------ insights

export type SpendingPace = {
  /** Média de gasto por dia, considerando só os dias já passados do mês. */
  dailyAvgCents: number;
  /** Projeção de fechamento do mês, no ritmo atual. */
  projectedCents: number;
};

/**
 * Ritmo de gasto do mês corrente: quanto já saiu, dividido pelos dias já
 * passados, projetado para o mês inteiro. Só faz sentido para o mês atual —
 * quem chama decide isso (comparando o `MonthRef` com `currentMonthRef()`).
 */
export function spendingPace(expenseSoFarCents: number, dayOfMonth: number, daysInMonth: number): SpendingPace {
  if (dayOfMonth <= 0) return { dailyAvgCents: 0, projectedCents: expenseSoFarCents };
  const dailyAvgCents = Math.round(expenseSoFarCents / dayOfMonth);
  return { dailyAvgCents, projectedCents: Math.round(dailyAvgCents * daysInMonth) };
}

export type CategoryAmount = {
  id: string;
  name: string;
  color: string;
  nature: "FIXED" | "VARIABLE";
  totalCents: number;
};

export type CategoryDelta = CategoryAmount & {
  previousCents: number;
  deltaCents: number;
  /** null = categoria não existia no mês anterior (não dá pra falar em "%"). */
  deltaPct: number | null;
};

/**
 * Compara o gasto por categoria de dois meses, categoria a categoria.
 * Ordenado pela maior variação em módulo — é o que mais importa mostrar
 * primeiro, pra cima ou pra baixo. Categoria que zerou este mês (mas gastou
 * no anterior) também aparece, com totalCents = 0.
 */
export function categoryDeltas(current: CategoryAmount[], previous: CategoryAmount[]): CategoryDelta[] {
  const prevMap = new Map(previous.map((p) => [p.id, p.totalCents]));
  const seen = new Set<string>();

  const rows: CategoryDelta[] = current.map((c) => {
    seen.add(c.id);
    const previousCents = prevMap.get(c.id) ?? 0;
    return {
      ...c,
      previousCents,
      deltaCents: c.totalCents - previousCents,
      deltaPct: previousCents > 0 ? Math.round(((c.totalCents - previousCents) / previousCents) * 1000) / 10 : null,
    };
  });

  for (const p of previous) {
    if (seen.has(p.id)) continue;
    rows.push({
      id: p.id,
      name: p.name,
      color: p.color,
      nature: p.nature,
      totalCents: 0,
      previousCents: p.totalCents,
      deltaCents: -p.totalCents,
      deltaPct: -100,
    });
  }

  return rows.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
}
