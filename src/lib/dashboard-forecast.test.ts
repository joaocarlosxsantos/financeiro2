import { describe, expect, it } from "vitest";
import { monthForecast } from "./forecast";
import { dashboardForecast, forecastCalendar, type ForecastTotals } from "./dashboard-forecast";

const now = new Date("2026-11-10T15:00:00Z");
const empty: ForecastTotals = { incomeCents: 0, expenseCents: 0, variableCents: 0, count: 0 };
const base = {
  ref: { year: 2026, month: 11 }, now, expectedIncomeCents: 600000,
  realized: { incomeCents: 300000, expenseCents: 100000, variableCents: 20000, count: 3 },
  scheduled: { incomeCents: 200000, expenseCents: 50000, variableCents: 10000, count: 2 },
};

describe("dashboardForecast — B4", () => {
  it("fecha o passado pelo realizado, sem renda cadastrada, média nem arredondamento", () => {
    const result = dashboardForecast({ ...base, ref: { year: 2026, month: 10 },
      realized: { incomeCents: 200000, expenseCents: 100001, variableCents: 100001, count: 2 } });
    // Reprodução antiga: renda cadastrada 600000 - round(100001/31)*31 = 499994.
    expect(monthForecast({ incomeCents: 600000, expenseSoFarCents: 100001, dayOfMonth: 31, daysInMonth: 31 }).projectedBalanceCents).toBe(499994);
    expect(result).toMatchObject({ period: "past", projectedBalanceCents: 99999,
      projectedExpenseCents: 100001, daysRemaining: 0, dailyAvgCents: 0,
      receivableCents: 0, payableCents: 0, additionalExpenseCents: 0 });
  });

  it("soma saldo realizado + a receber - a pagar - variável adicional uma única vez", () => {
    const result = dashboardForecast(base);
    expect(monthForecast({ incomeCents: 600000, expenseSoFarCents: 150000, dayOfMonth: 10, daysInMonth: 30 }).projectedBalanceCents).toBe(150000);
    // Saldo 200000 + renda restante max(600000-300000,200000)=300000
    // - previstos 50000 - variável adicional (20000/10*20 - 10000)=30000.
    expect(result).toMatchObject({ period: "current", realizedBalanceCents: 200000,
      receivableCents: 300000, payableCents: 50000, additionalExpenseCents: 30000,
      projectedBalanceCents: 420000, projectedExpenseCents: 180000,
      dailyAvgCents: 2000, daysRemaining: 20 });
  });

  it("não duplica renda já recebida nem multiplica gastos fixos pelo ritmo", () => {
    const result = dashboardForecast({ ...base, realized: { ...base.realized, incomeCents: 600000 }, scheduled: empty });
    expect(result.receivableCents).toBe(0);
    expect(result.projectedExpenseCents).toBe(140000);
    expect(result.projectedBalanceCents).toBe(460000);
  });

  it("usa todos os compromissos variáveis se superam a projeção, sem somá-los de novo", () => {
    const result = dashboardForecast({ ...base, scheduled: { ...base.scheduled, expenseCents: 150000, variableCents: 100000 } });
    expect(result.additionalExpenseCents).toBe(0);
    expect(result.projectedExpenseCents).toBe(250000);
  });

  it("futuro mostra apenas planejamento conhecido, sem inventar média nem dias restantes", () => {
    const result = dashboardForecast({ ...base, ref: { year: 2026, month: 12 }, realized: empty });
    expect(result).toMatchObject({ period: "future", dailyAvgCents: 0, daysRemaining: 0,
      receivableCents: 600000, payableCents: 50000, additionalExpenseCents: 0,
      projectedBalanceCents: 550000 });
  });

  it.each([10, 11, 12])("mês vazio %i não inventa sobra a partir da renda cadastrada", (month) => {
    const result = dashboardForecast({ ...base, ref: { year: 2026, month }, realized: empty, scheduled: empty });
    expect(result.hasData).toBe(false);
    expect(monthForecast({ incomeCents: 600000, expenseSoFarCents: 0, dayOfMonth: 10, daysInMonth: 30 }).projectedBalanceCents).toBe(600000);
    expect(result.projectedBalanceCents).toBe(0);
    expect(result.projectedExpenseCents).toBe(0);
    expect(Object.values(result).filter(v => typeof v === "number").every(Number.isFinite)).toBe(true);
  });

  it("respeita São Paulo na virada UTC e no ano novo, sem converter o fuso duas vezes", () => {
    expect(forecastCalendar({ year: 2026, month: 10 }, new Date("2026-11-01T01:30:00Z")))
      .toMatchObject({ period: "current", elapsedDays: 31, daysRemaining: 0, today: "2026-10-31" });
    expect(forecastCalendar({ year: 2026, month: 11 }, new Date("2026-11-01T03:00:00Z")))
      .toMatchObject({ period: "current", elapsedDays: 1, daysRemaining: 29 });
    expect(forecastCalendar({ year: 2026, month: 12 }, new Date("2027-01-01T02:59:00Z")).period).toBe("current");
  });

  it("arredonda só a projeção adicional e mantém o último dia exato", () => {
    const result = dashboardForecast({ ...base, now: new Date("2026-11-30T20:00:00Z"), scheduled: empty,
      realized: { incomeCents: 200000, expenseCents: 100001, variableCents: 100001, count: 2 }, expectedIncomeCents: 0 });
    expect(result.projectedBalanceCents).toBe(99999);
    expect(result.additionalExpenseCents).toBe(0);
    expect(result.daysRemaining).toBe(0);
    expect(forecastCalendar({ year: 2028, month: 2 }, new Date("2028-02-01T12:00:00Z")).daysInMonth).toBe(29);
  });

  it("primeiro dia, sem receita e entradas não finitas nunca produzem NaN ou divisão por zero", () => {
    const result = dashboardForecast({ ...base, now: new Date("2026-11-01T12:00:00Z"), expectedIncomeCents: Number.NaN,
      realized: { incomeCents: Infinity, expenseCents: 100, variableCents: 100, count: 1 }, scheduled: empty });
    expect(result.projectedBalanceCents).toBe(-3000);
    expect(result.savingsRatePct).toBe(0);
    expect(Object.values(result).filter(v => typeof v === "number").every(Number.isFinite)).toBe(true);
  });
});
