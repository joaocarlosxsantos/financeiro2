import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ analysis: vi.fn(), preferences: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/queries", () => ({ getBalances: async () => ({ availableCents: 100000,
  investedCents: 20000, netWorthCents: 120000, totalIncomplete: false }) }));
vi.mock("@/server/telegram/daily-summary", () => ({ loadPeriodMovements: async () => ({ incomeCents: 50000, expenseCents: 10000 }) }));
vi.mock("@/server/telegram/spending-forecast", () => ({ loadSpendingForecast: (...args: unknown[]) => mocks.analysis(...args) }));
vi.mock("./drivers", () => ({ notificationDrivers: { preferences: (...args: unknown[]) => mocks.preferences(...args) } }));
import { sourceEvents } from "./cron-data";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences.mockResolvedValue({ summary: true, spending: true });
  mocks.analysis.mockResolvedValue({ insights: ["Mesmo dia da semana passada: menos.", "Categorias que subiram: Saúde.", "Fim do mês: sobra."], daily: { remainingTodayCents: 5000 } });
});
describe("Resumo de produção com previsão robusta", () => {
  it("inclui comparativos e teto já descontando compromissos na entrega efetiva", async () => {
    const [event] = await sourceEvents("owner", "daily", new Date("2026-11-14T12:00Z"));
    expect(event.body.replace(/\u00a0/g, " ")).toContain("Restante hoje: R$ 50,00");
    expect(event.body).toContain("Fim do mês: sobra.");
    expect(event.body.length).toBeLessThan(1000);
    expect(mocks.analysis).toHaveBeenCalledWith("owner", expect.anything(), expect.any(Date));
  });
  it("preserva o resumo caso a análise esteja indisponível", async () => {
    mocks.analysis.mockRejectedValue(new Error("unavailable"));
    const [event] = await sourceEvents("owner", "daily", new Date("2026-11-14T12:00Z"));
    expect(event.body).toContain("Resumo diário");
    expect(event.body).not.toContain("Restante hoje");
  });
  it("respeita a preferência de insights de gastos", async () => {
    mocks.preferences.mockResolvedValue({ summary: true, spending: false });
    const [event] = await sourceEvents("owner", "daily", new Date("2026-11-14T12:00Z"));
    expect(mocks.analysis).not.toHaveBeenCalled();
    expect(event.body).not.toContain("Restante hoje");
  });
});
