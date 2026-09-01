import { test } from "vitest";
import assert from "node:assert/strict";
import {
  annualRateFromMonthly,
  compareStrategies,
  monthlyInterestCents,
  simulatePayoff,
  type DebtInput,
} from "./debts";

const cartao: DebtInput = {
  id: "cartao",
  name: "Rotativo do cartão",
  balanceCents: 300000, // R$ 3.000
  monthlyRateBps: 1300, // 13% a.m.
  minimumPaymentCents: 45000,
};

const emprestimo: DebtInput = {
  id: "emprestimo",
  name: "Empréstimo",
  balanceCents: 800000, // R$ 8.000
  monthlyRateBps: 300, // 3% a.m.
  minimumPaymentCents: 60000,
};

const pequena: DebtInput = {
  id: "pequena",
  name: "Parcelamento pequeno",
  balanceCents: 60000, // R$ 600
  monthlyRateBps: 100,
  minimumPaymentCents: 15000,
};

test("juros do mês", () => {
  assert.equal(monthlyInterestCents(300000, 1300), 39000); // 13% de 3.000 = 390
  assert.equal(monthlyInterestCents(100000, 150), 1500);
  assert.equal(monthlyInterestCents(0, 1300), 0);
});

test("taxa mensal para anual", () => {
  assert.equal(annualRateFromMonthly(100), 12.7); // 1% a.m. ≈ 12,7% a.a.
  assert.ok(annualRateFromMonthly(1300) > 300); // 13% a.m. passa de 300% a.a.
});

test("avalanche nunca paga mais juros que bola de neve", () => {
  const { avalanche, snowball, interestSavedCents } = compareStrategies(
    [cartao, emprestimo, pequena],
    50000,
  );

  assert.ok(avalanche.months !== null && snowball.months !== null, "as duas têm que quitar");
  assert.ok(
    avalanche.totalInterestCents <= snowball.totalInterestCents,
    "a avalanche é a estratégia matematicamente ótima",
  );
  assert.ok(interestSavedCents >= 0);
});

test("avalanche ataca a de maior juros; bola de neve, a de menor saldo", () => {
  const { avalanche, snowball } = compareStrategies([cartao, emprestimo, pequena], 50000);
  assert.equal(avalanche.order[0].debtId, "cartao", "13% a.m. é o pior juro da lista");
  assert.equal(snowball.order[0].debtId, "pequena", "R$ 600 é o menor saldo");
});

test("quita tudo e o saldo final é zero", () => {
  const result = simulatePayoff([cartao, emprestimo], 30000, "avalanche");
  assert.ok(result.months !== null);
  assert.equal(result.timeline[result.timeline.length - 1].balanceCents, 0);
  // o total pago tem que cobrir o principal mais os juros
  assert.equal(
    result.totalPaidCents,
    cartao.balanceCents + emprestimo.balanceCents + result.totalInterestCents,
  );
});

test("pagamento que não cobre os juros é sinalizado, não trava", () => {
  const impagavel: DebtInput = {
    id: "x",
    name: "Rotativo sem fim",
    balanceCents: 1000000,
    monthlyRateBps: 1500, // R$ 1.500 de juros por mês
    minimumPaymentCents: 50000, // paga R$ 500
  };
  const result = simulatePayoff([impagavel], 0, "avalanche");
  assert.equal(result.months, null);
  assert.ok(result.impossible, "precisa avisar que é impossível");
  assert.ok(result.impossible!.shortfallCents > 0);
});

test("sem dívidas, nada a simular", () => {
  const result = simulatePayoff([], 100000, "avalanche");
  assert.equal(result.months, 0);
  assert.equal(result.totalInterestCents, 0);
});

test("parcela liberada entra no esforço das outras", () => {
  // Com a bola de neve, quitar a pequena libera R$ 150/mês para as demais.
  const comPequena = simulatePayoff([cartao, pequena], 0, "snowball");
  assert.ok(comPequena.months !== null);
  const quitouPequena = comPequena.order.find((o) => o.debtId === "pequena");
  const quitouCartao = comPequena.order.find((o) => o.debtId === "cartao");
  assert.ok(quitouPequena && quitouCartao);
  assert.ok(quitouPequena!.monthPaid < quitouCartao!.monthPaid);
});
