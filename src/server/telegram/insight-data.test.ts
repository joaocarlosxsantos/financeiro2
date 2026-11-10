import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("@/db", () => ({ db: { select: () => { throw new Error("must use scoped connection"); } } }));
import { loadInsightData } from "./insight-data";

describe("consultas de insights", () => {
  it("todas as consultas são filtradas pelo dono; virada de mês e vencimento 31 são tratados", async () => {
    const predicates: SQL[] = [];
    const rows = [
      [{ kind: "INCOME", total: "10000" }, { kind: "EXPENSE", total: "2000" }],
      [{ id: "market", name: "Mercado", todayCents: "3000", historyCents: "30000", historyCount: "5", historyDays: "3", monthCents: "5000" }],
      [{ categoryId: "market", limitCents: 4000 }],
      [{ name: "Hoje", year: 2026, month: 11, dueDay: 31, totalCents: 1000 }, { name: "Próximo", year: 2026, month: 12, dueDay: 2, totalCents: 2000 }, { name: "Distante", year: 2026, month: 12, dueDay: 20, totalCents: 3000 }, { name: "Sem data", year: 2026, month: 11, dueDay: null, totalCents: 300 }],
    ];
    const select = vi.fn(() => {
      const result = rows.shift();
      const query = {
        from: () => query, leftJoin: () => query,
        where: (predicate: SQL) => { predicates.push(predicate); return query; },
        groupBy: async () => result,
        then: (resolve: (rows: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    });
    const connection = { select } as unknown as NonNullable<Parameters<typeof loadInsightData>[2]>;
    const result = await loadInsightData("linked-owner", { day: "2026-11-30", key: "2026-11-30:8", hour: 8 }, connection);
    expect(select).toHaveBeenCalledTimes(4);
    expect(result.summaryDay).toBe("2026-11-29");
    expect(result.incomeCents).toBe(10000);
    expect(result.categories[0].historyDays).toBe(3);
    expect(result.budgets[0]).toEqual({ name: "Mercado", limitCents: 4000, spentCents: 5000 });
    expect(result.due.map((b) => b.date)).toEqual(["2026-11-30", "2026-12-02"]);
    const compiled = predicates.map((p) => new PgDialect().sqlToQuery(p));
    for (const predicate of compiled) expect(predicate.params).toContain("linked-owner");
    for (const predicate of compiled.slice(0, 2)) {
      expect(predicate.sql).toContain('"transactions"."is_transfer" =');
      expect(predicate.sql).toContain('"transactions"."is_card_payment" =');
      expect(predicate.params).toContain("POSTED");
    }
    expect(compiled[3].sql).toContain('"bills"."paid" =');
    expect(compiled[3].params).toContain(false);
  });
});
