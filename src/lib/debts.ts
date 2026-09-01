/**
 * Estratégias de quitação de dívida — funções puras, sem banco.
 *
 * As duas estratégias clássicas:
 *
 * - **Avalanche**: paga o mínimo de todas e joga a sobra na dívida de MAIOR JUROS.
 *   É a que economiza mais dinheiro. Matematicamente sempre ganha.
 * - **Bola de neve**: joga a sobra na dívida de MENOR SALDO. Custa um pouco mais
 *   caro, mas entrega vitórias rápidas — e desistir no meio custa mais que os juros.
 *
 * Quando uma dívida é quitada, a parcela dela é somada ao esforço das outras.
 * Esse é o "efeito bola de neve" que dá nome à estratégia, e vale para as duas.
 */

export type DebtInput = {
  id: string;
  name: string;
  balanceCents: number;
  /** Juros ao mês em pontos-base: 1250 = 12,50% a.m. */
  monthlyRateBps: number;
  minimumPaymentCents: number;
};

export type Strategy = "avalanche" | "snowball";

export type PayoffStep = {
  debtId: string;
  name: string;
  /** Em qual mês da simulação a dívida foi quitada (1 = próximo mês). */
  monthPaid: number;
  interestPaidCents: number;
};

export type PayoffPoint = { month: number; balanceCents: number };

export type PayoffResult = {
  strategy: Strategy;
  /** Meses até ficar sem dívida. null = não quita dentro do horizonte. */
  months: number | null;
  totalInterestCents: number;
  totalPaidCents: number;
  order: PayoffStep[];
  timeline: PayoffPoint[];
  /**
   * Quando os pagamentos não cobrem nem os juros, a dívida cresce para sempre.
   * Nesse caso a simulação para e devolve o rombo mensal.
   */
  impossible?: { shortfallCents: number };
};

export function monthlyInterestCents(balanceCents: number, monthlyRateBps: number): number {
  return Math.round((balanceCents * monthlyRateBps) / 10_000);
}

/** Custo mensal de juros do conjunto — o "aluguel" que a dívida cobra por mês. */
export function totalMonthlyInterest(debts: DebtInput[]): number {
  return debts.reduce((acc, d) => acc + monthlyInterestCents(d.balanceCents, d.monthlyRateBps), 0);
}

type Tracked = { input: DebtInput; balance: number; interest: number };

function pickTarget(debts: Tracked[], strategy: Strategy) {
  const open = debts.filter((d) => d.balance > 0);
  if (!open.length) return null;

  return open.reduce((best, current) => {
    if (strategy === "avalanche") {
      if (current.input.monthlyRateBps !== best.input.monthlyRateBps) {
        return current.input.monthlyRateBps > best.input.monthlyRateBps ? current : best;
      }
      // empate de juros: quita antes a menor, para liberar parcela mais cedo
      return current.balance < best.balance ? current : best;
    }
    if (current.balance !== best.balance) return current.balance < best.balance ? current : best;
    return current.input.monthlyRateBps > best.input.monthlyRateBps ? current : best;
  });
}

/**
 * Simula mês a mês até zerar tudo.
 *
 * `extraCents` é quanto você consegue pagar por mês ALÉM da soma dos mínimos.
 * A ordem dentro do mês é a real: primeiro os juros incidem, depois o pagamento.
 */
export function simulatePayoff(
  inputs: DebtInput[],
  extraCents: number,
  strategy: Strategy,
  maxMonths = 600,
): PayoffResult {
  const debts = inputs
    .filter((d) => d.balanceCents > 0)
    .map((input) => ({ input, balance: input.balanceCents, interest: 0 }));

  if (!debts.length) {
    return {
      strategy,
      months: 0,
      totalInterestCents: 0,
      totalPaidCents: 0,
      order: [],
      timeline: [{ month: 0, balanceCents: 0 }],
    };
  }

  const order: PayoffStep[] = [];
  const timeline: PayoffPoint[] = [
    { month: 0, balanceCents: debts.reduce((acc, d) => acc + d.balance, 0) },
  ];

  let totalInterest = 0;
  let totalPaid = 0;

  for (let month = 1; month <= maxMonths; month++) {
    // 1) juros do mês
    let interestThisMonth = 0;
    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const interest = monthlyInterestCents(debt.balance, debt.input.monthlyRateBps);
      debt.balance += interest;
      debt.interest += interest;
      interestThisMonth += interest;
    }
    totalInterest += interestThisMonth;

    // 2) orçamento do mês: mínimos das dívidas ainda abertas + a sobra.
    //    Os mínimos das já quitadas continuam disponíveis — é a bola de neve.
    const openMinimums = debts
      .filter((d) => d.balance > 0)
      .reduce((acc, d) => acc + d.input.minimumPaymentCents, 0);
    const freedMinimums = debts
      .filter((d) => d.balance <= 0)
      .reduce((acc, d) => acc + d.input.minimumPaymentCents, 0);
    let budget = openMinimums + freedMinimums + extraCents;

    if (budget <= interestThisMonth) {
      return {
        strategy,
        months: null,
        totalInterestCents: totalInterest,
        totalPaidCents: totalPaid,
        order,
        timeline,
        impossible: { shortfallCents: interestThisMonth - budget },
      };
    }

    // 3) mínimos primeiro, para não ficar inadimplente em nenhuma
    for (const debt of debts) {
      if (debt.balance <= 0 || budget <= 0) continue;
      const pay = Math.min(debt.balance, debt.input.minimumPaymentCents, budget);
      debt.balance -= pay;
      budget -= pay;
      totalPaid += pay;
      if (debt.balance <= 0) {
        order.push({
          debtId: debt.input.id,
          name: debt.input.name,
          monthPaid: month,
          interestPaidCents: debt.interest,
        });
      }
    }

    // 4) o que sobrou vai todo para a dívida-alvo da estratégia
    while (budget > 0) {
      const target = pickTarget(debts, strategy);
      if (!target) break;
      const pay = Math.min(target.balance, budget);
      target.balance -= pay;
      budget -= pay;
      totalPaid += pay;
      if (target.balance <= 0) {
        order.push({
          debtId: target.input.id,
          name: target.input.name,
          monthPaid: month,
          interestPaidCents: target.interest,
        });
      }
    }

    const remaining = debts.reduce((acc, d) => acc + Math.max(0, d.balance), 0);
    timeline.push({ month, balanceCents: remaining });

    if (remaining <= 0) {
      return {
        strategy,
        months: month,
        totalInterestCents: totalInterest,
        totalPaidCents: totalPaid,
        order,
        timeline,
      };
    }
  }

  return {
    strategy,
    months: null,
    totalInterestCents: totalInterest,
    totalPaidCents: totalPaid,
    order,
    timeline,
  };
}

export type Comparison = {
  avalanche: PayoffResult;
  snowball: PayoffResult;
  /** Quanto a avalanche economiza de juros. Nunca é negativo. */
  interestSavedCents: number;
  /** Diferença de prazo em meses (positivo = avalanche termina antes). */
  monthsSaved: number;
};

export function compareStrategies(debts: DebtInput[], extraCents: number): Comparison {
  const avalanche = simulatePayoff(debts, extraCents, "avalanche");
  const snowball = simulatePayoff(debts, extraCents, "snowball");

  return {
    avalanche,
    snowball,
    interestSavedCents: Math.max(0, snowball.totalInterestCents - avalanche.totalInterestCents),
    monthsSaved:
      avalanche.months !== null && snowball.months !== null ? snowball.months - avalanche.months : 0,
  };
}

/** 1250 -> "12,50% a.m." */
export function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(".", ",")}% a.m.`;
}

/** Juros ao mês -> juros ao ano equivalente, em %. */
export function annualRateFromMonthly(bps: number): number {
  const monthly = bps / 10_000;
  return Math.round((Math.pow(1 + monthly, 12) - 1) * 1000) / 10;
}

export const DEBT_KIND_LABEL: Record<string, string> = {
  CARD_REVOLVING: "Rotativo do cartão",
  OVERDRAFT: "Cheque especial",
  PERSONAL_LOAN: "Empréstimo pessoal",
  FINANCING: "Financiamento",
  INSTALLMENT: "Parcelamento",
  OTHER: "Outra",
};

/** Taxas típicas no Brasil, para o usuário ter referência ao cadastrar. */
export const TYPICAL_RATES: { kind: string; bps: number }[] = [
  { kind: "CARD_REVOLVING", bps: 1300 },
  { kind: "OVERDRAFT", bps: 800 },
  { kind: "PERSONAL_LOAN", bps: 400 },
  { kind: "FINANCING", bps: 150 },
  { kind: "INSTALLMENT", bps: 0 },
  { kind: "OTHER", bps: 0 },
];
