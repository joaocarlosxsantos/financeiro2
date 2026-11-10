import { describe, expect, it } from "vitest";
import { monthForecast, formatForecastSummary } from "./forecast";

describe("monthForecast", () => {
  it("calcula média diária, gasto projetado e saldo de fim de mês no ritmo atual", () => {
    // Dia 10 de um mês de 30 dias. Gasto até agora: R$ 1.000,00 (100000 centavos).
    // Receita: R$ 4.000,00 (400000 centavos).
    // Média diária = 100000 / 10 = 10000 centavos (R$ 100,00/dia)
    // Projeção de gastos = 10000 * 30 = 300000 centavos (R$ 3.000,00)
    // Saldo projetado = 400000 - 300000 = 100000 centavos (R$ 1.000,00 de sobra)
    const result = monthForecast({
      incomeCents: 400000,
      expenseSoFarCents: 100000,
      dayOfMonth: 10,
      daysInMonth: 30,
    });

    expect(result.dailyAvgCents).toBe(10000);
    expect(result.projectedExpenseCents).toBe(300000);
    expect(result.projectedBalanceCents).toBe(100000);
    expect(result.daysRemaining).toBe(20);
    expect(result.status).toBe("positive");
  });

  it("sinaliza status negativo se os gastos projetados superarem a receita", () => {
    // Dia 15 de 30 dias. Gasto: R$ 3.000,00. Receita: R$ 5.000,00.
    // Média diária = 200,00. Projeção = R$ 6.000,00.
    // Saldo projetado = -1.000,00.
    const result = monthForecast({
      incomeCents: 500000,
      expenseSoFarCents: 300000,
      dayOfMonth: 15,
      daysInMonth: 30,
    });

    expect(result.dailyAvgCents).toBe(20000);
    expect(result.projectedExpenseCents).toBe(600000);
    expect(result.projectedBalanceCents).toBe(-100000);
    expect(result.daysRemaining).toBe(15);
    expect(result.status).toBe("negative");
  });

  it("trata dia zero ou sem gastos sem dividir por zero", () => {
    const result = monthForecast({
      incomeCents: 300000,
      expenseSoFarCents: 0,
      dayOfMonth: 0,
      daysInMonth: 31,
    });

    expect(result.dailyAvgCents).toBe(0);
    expect(result.projectedExpenseCents).toBe(0);
    expect(result.projectedBalanceCents).toBe(300000);
    expect(result.daysRemaining).toBe(31);
    expect(result.status).toBe("positive");
  });

  it("gera texto formatado para o bot do Telegram", () => {
    const forecast = monthForecast({
      incomeCents: 500000,
      expenseSoFarCents: 150000,
      dayOfMonth: 10,
      daysInMonth: 30,
    });

    const summary = formatForecastSummary(forecast, "novembro/2026");
    expect(summary).toContain("Previsão de fim do mês");
    expect(summary).toContain("novembro/2026");
    expect(summary).toContain("R$");
    expect(summary).toContain("restam 20 dias");
  });
});
