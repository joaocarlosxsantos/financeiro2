import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
import { loadSpendingForecast } from "./spending-forecast";
import { manualDailyBudget, manualForecast } from "./insight-store";
import { loadForecastAlert } from "./alerts";

const now = new Date("2026-11-14T12:00:00Z");
const tx = (extra = {}) => ({ date: new Date("2026-11-20T12:00:00Z"), amountCents: 50000,
  kind: "EXPENSE", nature: "FIXED", description: "Internet", category: "Casa", accountType: "CHECKING",
  isTransfer: false, isCardPayment: false, externalStatus: "POSTED", recurringRuleId: "generated",
  installmentGroupId: null, ...extra });
const rule = (id: string, extra = {}) => ({ accountType: "CHECKING", rule: { id, description: "Aluguel",
  amountCents: 100000, kind: "EXPENSE", dayOfMonth: 20, startYear: 2026, startMonth: 1,
  endYear: null, endMonth: null, ...extra } });
function connection(results: unknown[][]) {
  const predicates: SQL[] = [];
  let next = 0;
  const select = vi.fn(() => {
    const rows = results[next++] ?? [];
    const chain = { from: () => chain, innerJoin: () => chain, leftJoin: () => chain,
      where: (s: SQL) => { predicates.push(s); return chain; }, limit: () => Promise.resolve(rows),
      then: (resolve: (r: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
    return chain;
  });
  return { db: { select } as unknown as Parameters<typeof loadSpendingForecast>[1], predicates };
}

describe("Fontes da previsão Telegram", () => {
  it("reserva lançamentos futuros, regras não geradas e contas, sem duplicar regras ou fatura", async () => {
    const { db, predicates } = connection([
      [tx(), tx({ isCardPayment: true, amountCents: 900000 })],
      [rule("generated"), rule("new"), rule("ended", { endYear: 2026, endMonth: 10 }),
        rule("not-started", { startYear: 2027 }), { ...rule("investment"), accountType: "INVESTMENT" }],
      [{ name: " Internet ", totalCents: 50000, dueDay: 20 }, { name: "IPTU", totalCents: 15000, dueDay: 30 }],
      [{ monthlyIncomeCents: 600000 }], [],
    ]);
    const result = await loadSpendingForecast("owner-test", db, now);
    expect(result.committedCents).toBe(165000);
    expect(result.forecast.projectedBalanceCents).toBe(435000);
    const dialect = new PgDialect();
    for (const predicate of predicates) expect(dialect.sqlToQuery(predicate).params).toContain("owner-test");
    expect(predicates).toHaveLength(5);
  });

  it("usa o dia de São Paulo mesmo antes da virada UTC e inclui regras no último dia de fevereiro", async () => {
    const { db } = connection([[], [rule("leap", { dayOfMonth: 31 })], [], [], []]);
    const result = await loadSpendingForecast("owner", db, new Date("2028-03-01T01:00:00Z"));
    expect(result.forecast.daysRemaining).toBe(0);
    expect(result.committedCents).toBe(100000);
    expect(result.insights.join("\n")).toContain("29/02");
  });

  it("comandos e alerta compartilham a fonte e respeitam a conexão fornecida", async () => {
    const data = () => connection([[tx()], [], [], [{ monthlyIncomeCents: 10000 }], []]).db;
    expect(await manualForecast("owner", data(), now)).toContain("falta mensal");
    expect(await manualDailyBudget("owner", data(), now)).toContain("Sem margem");
    expect(await loadForecastAlert("owner", now, data())).toMatchObject({ balanceCents: -40000, recommendedDailyCents: 0 });
  });
});
