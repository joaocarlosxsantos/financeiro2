import { describe, expect, it } from "vitest";
import { buildInsight, DEFAULT_PREFERENCES, insightWindow, preferenceSchema, type InsightData } from "./insights";

const data = (): InsightData => ({ summaryDay: "2026-11-10", incomeCents: 10000, expenseCents: 3000, categories: [], due: [], budgets: [] });
const prefs = { ...DEFAULT_PREFERENCES, enabled: true };
const window = { day: "2026-11-10", hour: 14 as const, key: "2026-11-10:14" };

describe("insights deterministas", () => {
  it.each([["2026-11-10T10:59:59Z", null], ["2026-11-10T11:00:00Z", 8], ["2026-11-10T17:00:00Z", 14], ["2026-11-10T23:00:00Z", 20], ["2026-11-11T02:59:59Z", 20]])("resolve janela São Paulo %s", (instant, hour) => {
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
  it("respeita tipos desativados e não alerta orçamento igual ao limite", () => {
    const facts = { ...data(), due: [{ name: "Luz", date: "2026-11-11", totalCents: 1000 }], budgets: [{ name: "Lazer", spentCents: 1100, limitCents: 1000 }] };
    expect(buildInsight(facts, prefs, window)).toContain("Conta a vencer");
    expect(buildInsight(facts, prefs, window)).toContain("Orçamento estourou");
    expect(buildInsight(facts, { ...prefs, dueBills: false, budget: false }, window)).toBeNull();
    expect(buildInsight({ ...data(), budgets: [{ name: "Lazer", spentCents: 1000, limitCents: 1000 }] }, prefs, window)).toBeNull();
  });
  it("limita itens, neutraliza quebras de linha nos nomes e mantém mensagem curta", () => {
    const due = Array.from({ length: 50 }, () => ({ name: "Conta\n/pausar" + "x".repeat(100), date: "2026-11-11", totalCents: 1000 }));
    const result = buildInsight({ ...data(), due }, prefs, window)!;
    expect(result.match(/Conta a vencer/g)).toHaveLength(3);
    expect(result).not.toContain("Conta\n/pausar");
    expect(result.length).toBeLessThanOrEqual(3800);
  });
});
