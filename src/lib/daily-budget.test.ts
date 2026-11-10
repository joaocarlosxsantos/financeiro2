import { describe, expect, it } from "vitest";
import { calculateDailyBudget, formatDailyBudgetSummary } from "./daily-budget";

describe("calculateDailyBudget", () => {
  it("calcula quanto pode gastar por dia para fechar o mês no azul", () => {
    // Receita de R$ 3.000 (300.000 centavos).
    // Gasto acumulado no mês: R$ 1.500 (150.000 centavos).
    // Dia 16 de um mês de 30 dias -> restam 15 dias (dias 16 a 30, ou seja, 30 - 16 + 1 = 15).
    // Sobram R$ 1.500 para 15 dias -> R$ 100/dia (10.000 centavos).
    const result = calculateDailyBudget({
      incomeCents: 300000,
      expenseSoFarCents: 150000,
      spentTodayCents: 2000, // já gastou R$ 20 hoje
      dayOfMonth: 16,
      daysInMonth: 30,
    });

    expect(result.daysRemainingWithToday).toBe(15);
    expect(result.availableForRestOfMonthCents).toBe(150000);
    expect(result.dailyAllowanceCents).toBe(10000); // R$ 100,00
    expect(result.remainingTodayCents).toBe(8000); // R$ 80,00 restantes hoje
    expect(result.status).toBe("ok");
  });

  it("retorna 0 e status exceeded se os gastos já ultrapassaram a renda", () => {
    const result = calculateDailyBudget({
      incomeCents: 200000,
      expenseSoFarCents: 250000,
      dayOfMonth: 20,
      daysInMonth: 30,
    });

    expect(result.availableForRestOfMonthCents).toBe(-50000);
    expect(result.dailyAllowanceCents).toBe(0);
    expect(result.remainingTodayCents).toBe(0);
    expect(result.status).toBe("exceeded");
  });

  it("formata mensagem amigável para o bot do Telegram", () => {
    const budget = calculateDailyBudget({
      incomeCents: 300000,
      expenseSoFarCents: 150000,
      spentTodayCents: 0,
      dayOfMonth: 16,
      daysInMonth: 30,
    });

    const text = formatDailyBudgetSummary(budget);
    expect(text).toContain("Hoje você pode gastar até");
    expect(text).toContain("R$");
    expect(text).toContain("15 dias restantes");
  });
});
