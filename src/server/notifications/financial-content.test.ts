import { describe, expect, it } from "vitest";
import { dailyFinancialEvent, financialInsightEvents } from "./financial-content";
import { DEFAULT_NOTIFICATION_PREFERENCES as prefs, pushPayload } from "./policy";
import { spendingForecast } from "@/lib/spending-forecast";
import type { InsightData } from "@/server/telegram/insights";
const day = "2026-11-14";
const empty: InsightData = { summaryDay: day, incomeCents: 0, expenseCents: 0, categories: [], budgets: [], due: [] };
const balance = { availableCents: 10000, totalIncomplete: false, accounts: [{ type: "CHECKING" }] };
describe("Conteúdo financeiro verificável", () => {
  it("nao produz alerta separado de previsao, mesmo quando o dado legado contem deficit", () => {
    const raw = { ...empty, syncProblem: true, forecast: { balanceCents: -1000 } };
    expect(financialInsightEvents("owner", day, raw, true)).toEqual([]);
    expect(financialInsightEvents("owner", day, raw, false)).toEqual([]);
  });
  it("assinatura exige cobrança postada nesta ocorrência e aumento verificável", () => {
    const sub = { name: "Netflix", currentCents: 4990, previousCents: 3990, hasPriceIncrease: true, isRegistered: true };
    expect(financialInsightEvents("owner", day, { ...empty, subscriptions: [sub] }, true)).toEqual([]);
    const data = { ...empty, subscriptions: [{ ...sub, lastChargeId: "charge1", lastChargedOn: day }] };
    const [event] = financialInsightEvents("owner", day, data, true);
    expect(event.actionUrl).toBe("/recorrentes"); expect(event.body).toContain("aumento"); expect(event.dedupeKey).toBe("subscription:charge1");
    expect(financialInsightEvents("owner", day, data, false)).toEqual([]);
    expect(financialInsightEvents("owner", "2026-11-15", data, true)).toEqual([]);
  });
  it("gasto por categoria tem destino específico e identidade independente do texto", () => {
    const data = { ...empty, categories: [{ id: "cat", name: "Lazer", todayCents: 50000, historyCents: 30000, historyCount: 6, historyDays: 5 }] };
    const [event] = financialInsightEvents("owner", day, data, true);
    expect(event.actionUrl).toBe("/insights"); expect(event.dedupeKey).toBe(`spending:cat:${day}`);
    expect(pushPayload(event, prefs, "id").body).not.toContain("Lazer");
  });
  it("resumo distingue ontem, hoje e projeção; não deriva gasto de restante truncado", () => {
    const analysis = spendingForecast({ today: day, entries: [], commitments: [], expectedIncomeCents: 600000 });
    analysis.spentTodayCents = 12345; analysis.daily.dailyAllowanceCents = 10000; analysis.daily.remainingTodayCents = 0;
    const event = dailyFinancialEvent("owner", "daily", new Date(`${day}T11:00Z`), false, balance, { incomeCents: 50000, expenseCents: 10000 }, analysis);
    expect(event.body).toContain("Hoje: gasto variável R$ 123,45"); expect(event.body).toContain("Ontem (13/11)");
    expect(event.body).toContain("histórico curto"); expect(event.body.startsWith("Projeção mensal")).toBe(true);
    const weekly = dailyFinancialEvent("owner", "week", new Date("2026-11-16T11:00Z"), true, balance, { incomeCents: 0, expenseCents: 1 }, undefined);
    expect(weekly.body).toContain("Últimos sete dias (09/11–15/11)");
  });
});
