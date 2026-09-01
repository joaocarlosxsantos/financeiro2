import { test } from "vitest";
import assert from "node:assert/strict";
import {
  balanceCents,
  emergencyTargetCents,
  fiftyThirtyTwenty,
  financialHealth,
  monthsOfRunway,
  monthsToTarget,
  projectBalance,
  savingsRate,
} from "./finance";

const mes = (income: number, expense: number, fixed = 0) => ({
  incomeCents: income,
  expenseCents: expense,
  fixedCents: fixed,
  variableCents: expense - fixed,
});

test("sobra do mês pode ser negativa", () => {
  assert.equal(balanceCents(mes(500000, 300000)), 200000);
  assert.equal(balanceCents(mes(300000, 500000)), -200000);
});

test("taxa de economia não divide por zero", () => {
  assert.equal(savingsRate(mes(0, 0)), 0);
  assert.equal(savingsRate(mes(0, 100000)), 0, "sem renda declarada, não inventa porcentagem");
  assert.equal(savingsRate(mes(1000000, 800000)), 20);
  assert.equal(savingsRate(mes(1000000, 1200000)), -20, "gastar mais que ganhar dá taxa negativa");
});

test("reserva usa o custo de vida, não a renda", () => {
  // quem ganha muito e gasta pouco precisa de reserva menor
  assert.equal(emergencyTargetCents(300000, 6), 1800000);
  assert.equal(emergencyTargetCents(0, 6), 0);
  assert.equal(emergencyTargetCents(300000, 0), 0);
});

test("meses de folga", () => {
  assert.equal(monthsOfRunway(900000, 300000), 3);
  assert.equal(monthsOfRunway(450000, 300000), 1.5);
  assert.equal(monthsOfRunway(100000, 0), 0, "sem custo conhecido, não estima folga");
});

test("50/30/20 divide a renda inteira", () => {
  const split = fiftyThirtyTwenty(1000000);
  assert.equal(split.necessitiesCents, 500000);
  assert.equal(split.wantsCents, 300000);
  assert.equal(split.futureCents, 200000);
  assert.equal(
    split.necessitiesCents + split.wantsCents + split.futureCents,
    1000000,
    "as três fatias têm que somar a renda",
  );
});

test("nota de saúde fica entre 0 e 100 e é a soma das partes", () => {
  const casos = [
    { savingsRatePct: -50, runwayMonths: 0, emergencyMonthsTarget: 6, fixedShareOfIncomePct: 95 },
    { savingsRatePct: 0, runwayMonths: 0, emergencyMonthsTarget: 6, fixedShareOfIncomePct: 50 },
    { savingsRatePct: 20, runwayMonths: 6, emergencyMonthsTarget: 6, fixedShareOfIncomePct: 40 },
    { savingsRatePct: 200, runwayMonths: 99, emergencyMonthsTarget: 6, fixedShareOfIncomePct: 0 },
  ];

  for (const caso of casos) {
    const health = financialHealth(caso);
    assert.ok(health.score >= 0 && health.score <= 100, `score fora da faixa: ${health.score}`);
    assert.equal(
      health.parts.reduce((acc, p) => acc + p.score, 0),
      health.score,
      "o score tem que ser exatamente a soma das partes mostradas",
    );
    assert.equal(health.parts.length, 3);
  }
});

test("nota de saúde: situação boa pontua mais que situação ruim", () => {
  const ruim = financialHealth({
    savingsRatePct: -10,
    runwayMonths: 0,
    emergencyMonthsTarget: 6,
    fixedShareOfIncomePct: 90,
  });
  const boa = financialHealth({
    savingsRatePct: 25,
    runwayMonths: 8,
    emergencyMonthsTarget: 6,
    fixedShareOfIncomePct: 35,
  });

  assert.equal(ruim.score, 0);
  assert.equal(ruim.tone, "danger");
  assert.equal(boa.score, 100);
  assert.equal(boa.tone, "great");
});

test("juros compostos: sem aporte, só o rendimento", () => {
  // R$ 1.000 a 12% ao ano, por 12 meses, tem que dar R$ 1.120
  const pontos = projectBalance(100000, 0, 12, 12, (i) => String(i));
  assert.equal(pontos.length, 13, "inclui o mês zero");
  assert.equal(pontos[0].balanceCents, 100000);
  assert.equal(Math.round(pontos[12].balanceCents / 100), 1120);
});

test("juros compostos: sem rendimento, só os aportes", () => {
  const pontos = projectBalance(0, 50000, 0, 10, (i) => String(i));
  assert.equal(pontos[10].balanceCents, 500000);
});

test("prazo para alcançar um alvo", () => {
  assert.equal(monthsToTarget(100000, 0, 0, 100000), 0, "já chegou");
  assert.equal(monthsToTarget(0, 10000, 0, 100000), 10);
  assert.equal(
    monthsToTarget(0, 0, 0, 100000),
    null,
    "sem aporte e sem rendimento, nunca chega",
  );
  assert.equal(
    monthsToTarget(100000, 100, 0, 100000000, 24),
    null,
    "não alcançável dentro do horizonte consultado",
  );
});
