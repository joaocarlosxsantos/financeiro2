import { describe, expect, it } from "vitest";
import { proactiveLines } from "./proactive-copy";
import { DEFAULT_PREFERENCES, type InsightData } from "./insights";

const prefs = { ...DEFAULT_PREFERENCES, enabled: true, summary: false };
const data = (): InsightData => ({ summaryDay: "2026-11-12", incomeCents: 0, expenseCents: 0, categories: [], due: [], budgets: [] });

describe("avisos proativos curtos", () => {
  it("conta de amanhã e fechamento têm uma linha e ação direta", () => {
    expect(proactiveLines({ ...data(), due: [{ name: "Luz", date: "2026-11-13", totalCents: 8500, diffDays: 1 }] }, prefs))
      .toEqual(["Conta vence amanhã: Luz, R$ 85,00. Veja no app."]);
    expect(proactiveLines({ ...data(), cardClosings: [{ id: "c1", cardName: "Visa", closingDate: "2026-11-13", diffDays: 1 }] }, prefs))
      .toEqual(["Fatura Visa fecha amanhã. Veja /cartao."]);
  });
  it("só alerta gasto acima do usual com histórico suficiente e diferença mínima", () => {
    const row = { name: "Mercado", todayCents: 8000, historyCents: 90000, historyCount: 6, historyDays: 4 };
    expect(proactiveLines({ ...data(), categories: [row] }, prefs)).toEqual(["Gasto acima do usual em Mercado: R$ 80,00. Veja /relatorio."]);
    for (const changes of [{ historyCount: 4 }, { historyDays: 2 }, { historyCents: 0 }, { todayCents: 3999 }])
      expect(proactiveLines({ ...data(), categories: [{ ...row, ...changes }] }, prefs)).toEqual([]);
  });
  it("saldo baixo usa só posição conhecida zero/negativa; não inventa um limite em reais", () => {
    expect(proactiveLines({ ...data(), cashBalanceCents: 0 }, prefs)).toEqual(["Saldo disponível zerado: R$ 0,00. Confira /saldo."]);
    expect(proactiveLines({ ...data(), cashBalanceCents: -100 }, prefs)[0]).toContain("Saldo disponível negativo");
    for (const balance of [undefined, NaN, Infinity, 1]) expect(proactiveLines({ ...data(), cashBalanceCents: balance }, prefs)).toEqual([]);
  });
  it("problema de sync avisa sem vazar erro e evita alerta de saldo baseado em posição possivelmente antiga", () => {
    expect(proactiveLines({ ...data(), syncProblem: true, cashBalanceCents: -100 }, prefs))
      .toEqual(["Sincronização com problema. Confira Conexões no app."]);
  });
  it("respeita as flags existentes de conta, gasto, cartão e saldo, incluindo0025", () => {
    const facts = { ...data(), cashBalanceCents: 0, cardClosings: [{ id: "c1", cardName: "Visa", closingDate: "2026-11-13", diffDays: 1 }],
      due: [{ name: "Luz", date: "2026-11-13", totalCents: 8500, diffDays: 1 }],
      categories: [{ name: "Mercado", todayCents: 8000, historyCents: 90000, historyCount: 6, historyDays: 4 }] };
    expect(proactiveLines(facts, { ...prefs, dueBills: false, spending: false, cardInvoice: false, negativeForecast: false })).toEqual([]);
  });
  it("cada aviso cabe em uma linha curta, neutraliza comandos/links no nome e limita a3", () => {
    const due = Array.from({ length: 20 }, (_, i) => ({ name: `Conta${i}\n/pausar https://bad.test/` + "x".repeat(100), date: "2026-11-13", totalCents: 8500, diffDays: 1 }));
    const lines = proactiveLines({ ...data(), due }, prefs);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(160); expect(line).not.toMatch(/[\r\n]|https:|\/pausar/);
    }
  });
});
