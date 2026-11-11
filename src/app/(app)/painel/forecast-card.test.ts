import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dashboardForecast } from "@/lib/dashboard-forecast";
import { ForecastCard } from "./forecast-card";

function render(month: number, count = 2) {
  return renderToStaticMarkup(createElement(ForecastCard, {
    monthName: "mês selecionado", forecast: dashboardForecast({ ref: { year: 2026, month },
      now: new Date("2026-11-10T12:00:00Z"), expectedIncomeCents: 600000,
      realized: { incomeCents: count ? 200000 : 0, expenseCents: count ? 100001 : 0, variableCents: 0, count },
      scheduled: { incomeCents: 0, expenseCents: 0, variableCents: 0, count: 0 } }),
  }));
}

describe("ForecastCard temporal states", () => {
  it("passado exibe fechamento realizado, sem ritmo, estimativa ou dias restantes", () => {
    const html = render(10);
    expect(html).toContain("Fechamento do mês");
    expect(html).toContain("Resultado realizado");
    expect(html).not.toMatch(/dias? restante|Ritmo|estimad|projetad/i);
  });
  it("atual explica saldo e componentes sem apresentar o resultado como saldo bancário", () => {
    const html = render(11);
    expect(html).toContain("Previsão de fim do mês");
    expect(html).toContain("A receber / a pagar");
    expect(html).toContain("20 dias restantes");
    expect(html).toContain("sem saldo inicial das contas");
  });
  it("futuro apresenta planejamento sem ritmo ou contagem de dias", () => {
    const html = render(12);
    expect(html).toContain("Planejamento do mês");
    expect(html).not.toMatch(/dias? restante|Ritmo/i);
  });
  it("vazio tem estado explícito, sem promessa de sobra da renda cadastrada", () => {
    const html = render(11, 0);
    expect(html).toContain("Sem movimentações");
    expect(html).not.toContain("Resultado estimado");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
