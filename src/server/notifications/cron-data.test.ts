import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ analysis: vi.fn(), preferences: vi.fn(), insights: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/queries", () => ({ getBalances: async () => ({ availableCents: 100000,
  investedCents: 20000, netWorthCents: 120000, totalIncomplete: false }) }));
vi.mock("@/server/telegram/daily-summary", () => ({ loadPeriodMovements: async () => ({ incomeCents: 50000, expenseCents: 10000 }) }));
vi.mock("@/server/telegram/spending-forecast", () => ({ loadSpendingForecast: (...args: unknown[]) => mocks.analysis(...args) }));
vi.mock("@/server/telegram/insight-data", () => ({ loadInsightData: (...args: unknown[]) => mocks.insights(...args) }));
vi.mock("@/server/telegram/monthly-report", () => ({ loadMonthlyReport: async () => "Fechamento do mês anterior" }));
vi.mock("./drivers", () => ({ notificationDrivers: { preferences: (...args: unknown[]) => mocks.preferences(...args) } }));
import { sourceEvents } from "./cron-data";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences.mockResolvedValue({ summary: true, spending: true });
  mocks.analysis.mockResolvedValue({ historyDays: 40, spentTodayCents: 1000, forecast: { projectedBalanceCents: 50000 }, daily: { dailyAllowanceCents: 6000, remainingTodayCents: 5000 } });
  mocks.insights.mockResolvedValue({ categories: [], subscriptions: [], forecast: { balanceCents: -99999 }, due: [], budgets: [] });
});
describe("Resumo de produção com previsão robusta", () => {
  it("inclui comparativos e teto já descontando compromissos na entrega efetiva", async () => {
    const [event] = await sourceEvents("owner", "daily", new Date("2026-11-14T11:00Z"));
    expect(event.body.replace(/\u00a0/g, " ")).toContain("restante R$ 50,00");
    expect(event.body).toContain("Ontem (13/11)");
    expect(event.body.length).toBeLessThan(1000);
    expect(mocks.analysis).toHaveBeenCalledWith("owner", expect.anything(), expect.any(Date));
  });
  it("preserva o resumo caso a análise esteja indisponível", async () => {
    mocks.analysis.mockRejectedValue(new Error("unavailable"));
    const [event] = await sourceEvents("owner", "daily", new Date("2026-11-14T11:00Z"));
    expect(event.body).toContain("Ontem");
    expect(event.body).not.toContain("restante");
  });
  it("resumo contém previsão e teto mesmo com os alertas avulsos desligados", async () => {
    mocks.preferences.mockResolvedValue({ summary: true, spending: false, negativeForecast: false });
    const [event] = await sourceEvents("owner", "daily", new Date("2026-11-14T11:00Z"));
    expect(mocks.analysis).toHaveBeenCalled();
    expect(event.body).toContain("Projeção mensal");
    expect(event.body).toContain("teto estimado");
    expect(event.dedupeKey).toBe("summary:2026-11-14");
  });
  it("não produz notificações de previsão nos insights e mantém um resumo no dia 1", async () => {
    expect(await sourceEvents("owner", "insights", new Date("2026-11-14T17:00Z"))).toEqual([]);
    expect(mocks.analysis).not.toHaveBeenCalled();
    expect(await sourceEvents("owner", "daily", new Date("2027-02-01T11:00Z"))).toEqual([]);
    const monthly = await sourceEvents("owner", "monthly", new Date("2027-02-01T11:00Z"));
    expect(monthly).toHaveLength(1); expect(monthly[0].dedupeKey).toBe("summary:2027-02-01");
    expect(monthly[0].body).toContain("Projeção mensal"); expect(monthly[0].body).toContain("Fechamento do mês anterior");
  });
});
