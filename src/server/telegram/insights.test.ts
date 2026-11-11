import { describe, expect, it } from "vitest";
import { buildInsight, DEFAULT_PREFERENCES, insightWindow, preferenceSchema, type InsightData } from "./insights";

const data = (): InsightData => ({ summaryDay: "2026-11-10", incomeCents: 10000, expenseCents: 3000, categories: [], due: [], budgets: [] });
const prefs = { ...DEFAULT_PREFERENCES, enabled: true };
const window = { day: "2026-11-10", hour: 14 as const, key: "2026-11-10:14" };

describe("insights deterministas", () => {
  it.each([
    ["2026-11-10T10:59:59Z", null],
    ["2026-11-10T11:00:00Z", 8],
    ["2026-11-10T17:00:00Z", 14],
    ["2026-11-10T23:00:00Z", 20],
    ["2026-11-11T00:59:59Z", 20],
    ["2026-11-11T01:00:00Z", null],
    ["2026-11-11T02:59:59Z", null],
  ])("resolve janela São Paulo %s (bloqueia madrugada fora de 08-21h)", (instant, hour) => {
    const result = insightWindow(new Date(instant));
    expect(result?.hour ?? null).toBe(hour);
    if (result) expect(result.day).toBe("2026-11-10");
  });
  it("não promete horários arbitrários ou duplicados", () => {
    expect(preferenceSchema.safeParse(prefs).success).toBe(true);
    for (const hours of [[9], [], [8, 8]]) expect(preferenceSchema.safeParse({ ...prefs, hours }).success).toBe(false);
  });
  it("resumo da manhã/noite mostra valores registrados, sem IA", () => {
    expect(buildInsight(data(), prefs, { ...window, hour: 20 })).toContain("diferença R$");
    expect(buildInsight(data(), prefs, window)).toBeNull();
    expect(buildInsight(data(), prefs, window, true)).toContain("resumo solicitado");
  });
  it("alerta acima de 150% da média diária exige histórico e diferença mínima", () => {
    const row = { name: "Mercado", todayCents: 3000, historyCents: 30000, historyCount: 5, historyDays: 3 };
    expect(buildInsight({ ...data(), categories: [row] }, prefs, window)).toContain("acima da média em Mercado");
    for (const changes of [{ historyCount: 4 }, { historyDays: 2 }, { todayCents: 1500 }, { todayCents: 1900 }]) {
      expect(buildInsight({ ...data(), categories: [{ ...row, ...changes }] }, prefs, window)).toBeNull();
    }
  });
  it("respeita tipos desativados e alerta orçamento em 80% e 100%", () => {
    const facts = { ...data(), due: [{ name: "Luz", date: "2026-11-11", totalCents: 1000 }], budgets: [{ name: "Lazer", spentCents: 1100, limitCents: 1000 }] };
    expect(buildInsight(facts, prefs, window)).toContain("Conta a vencer");
    expect(buildInsight(facts, prefs, window)).toContain("Orçamento estourou");
    expect(buildInsight(facts, { ...prefs, dueBills: false, budget: false }, window)).toBeNull();
    // Abaixo de 80% (75%) não emite alerta
    expect(buildInsight({ ...data(), budgets: [{ name: "Lazer", spentCents: 750, limitCents: 1000 }] }, prefs, window)).toBeNull();
    // Em 80% emite alerta preventivo
    expect(buildInsight({ ...data(), budgets: [{ name: "Lazer", spentCents: 800, limitCents: 1000 }] }, prefs, window)).toContain("atingiu 80%");
    // Em 100% emite alerta de estouro
    expect(buildInsight({ ...data(), budgets: [{ name: "Lazer", spentCents: 1000, limitCents: 1000 }] }, prefs, window)).toContain("Orçamento estourou");
  });
  it("emite alertas proativos de faturas de cartão (3 dias, 1 dia, hoje)", () => {
    const cardFacts: InsightData = {
      ...data(),
      cardInvoices: [
        { id: "c1", cardName: "Nubank", invoiceCents: 150000, dueDate: "13/11", diffDays: 3 },
        { id: "c2", cardName: "Inter", invoiceCents: 45000, dueDate: "11/11", diffDays: 1 },
        { id: "c3", cardName: "XP", invoiceCents: 80000, dueDate: "10/11", diffDays: 0 },
      ],
    };
    const text = buildInsight(cardFacts, prefs, window)!;
    expect(text).toContain("Fatura do Nubank vence em 3 dias");
    expect(text).toContain("Fatura do Inter vence amanhã");
    expect(text).toContain("Fatura do XP vence hoje");

    // Desligar cardInvoice silencia alertas de cartão
    expect(buildInsight(cardFacts, { ...prefs, cardInvoice: false }, window)).toBeNull();
  });
  it("emite alerta de saldo previsto negativo com teto diário", () => {
    const deficitFacts: InsightData = {
      ...data(),
      forecast: {
        balanceCents: -45000,
        projectedExpenseCents: 245000,
        recommendedDailyCents: 0,
        status: "DEFICIT",
      },
    };
    const text = buildInsight(deficitFacts, prefs, window)!;
    expect(text).toMatch(/Previsão de saldo negativo para o fim do mês: -R\$[\s\u00a0]450,00/);
    expect(text).toMatch(/Sugestão de teto: R\$[\s\u00a0]0,00\/dia/);

    // Desligar negativeForecast silencia o alerta
    expect(buildInsight(deficitFacts, { ...prefs, negativeForecast: false }, window)).toBeNull();
  });
  it("emite contas a vencer hoje e amanhã", () => {
    const billsFacts: InsightData = {
      ...data(),
      due: [
        { name: "Água", date: "2026-11-10", totalCents: 8500, diffDays: 0 },
        { name: "Energia", date: "2026-11-11", totalCents: 14000, diffDays: 1 },
      ],
    };
    const text = buildInsight(billsFacts, prefs, window)!;
    expect(text).toMatch(/Conta a vencer hoje: Água, R\$[\s\u00a0]85,00\./);
    expect(text).toMatch(/Conta a vencer amanhã: Energia, R\$[\s\u00a0]140,00\./);
  });
  it("limita itens, neutraliza quebras de linha nos nomes e mantém mensagem curta", () => {
    const due = Array.from({ length: 50 }, () => ({ name: "Conta\n/pausar" + "x".repeat(100), date: "2026-11-11", totalCents: 1000 }));
    const result = buildInsight({ ...data(), due }, prefs, window)!;
    expect(result.match(/Conta a vencer/g)).toHaveLength(3);
    expect(result).not.toContain("Conta\n/pausar");
    expect(result.length).toBeLessThanOrEqual(3800);
  });
});
