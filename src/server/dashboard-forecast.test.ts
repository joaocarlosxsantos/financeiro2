import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { getDashboardForecast } from "./dashboard-forecast";
import type { RecurringRuleRow } from "./queries";

const ref = { year: 2026, month: 11 };
const now = new Date("2026-11-10T15:00:00Z");
function rule(id: string, accountId = "cash", kind: "INCOME" | "EXPENSE" = "EXPENSE"): RecurringRuleRow {
  return { id, accountId, kind, amountCents: 10000, nature: "FIXED", description: id,
    dayOfMonth: 15, active: true, notes: null, categoryId: null, categoryName: null,
    categoryColor: null, accountName: accountId, startYear: 2026, startMonth: 1,
    endYear: null, endMonth: null, generated: false, dueThisMonth: true };
}

function fixture(movements: unknown[][] = []) {
  const queries: { query: string; params: unknown[] }[] = [];
  const connection = drizzle(async (query, params) => {
    queries.push({ query, params });
    return { rows: query.includes('from "transactions"') ? movements : [
      ["cash", "CHECKING", "manual", false], ["credit", "CREDIT_CARD", "manual", false],
      ["bank", "CHECKING", "integracao", false], ["old", "CHECKING", "manual", true],
    ] };
  });
  return { connection, queries };
}

describe("getDashboardForecast", () => {
  it("separa realizado/previsto e não duplica recorrência já gerada, nem mesmo durante a leitura", async () => {
    const { connection } = fixture([
      ["INCOME", "FIXED", false, "300000", 1, [], "0"],
      ["EXPENSE", "VARIABLE", false, "20000", 1, [], "20000"],
      ["EXPENSE", "FIXED", true, "10000", 1, ["generated"], "0"],
    ]);
    const result = await getDashboardForecast("owner", ref, { now, expectedIncomeCents: 300000,
      pendingRules: [rule("generated"), rule("new"), rule("new"), rule("card", "credit"), rule("integrated", "bank"), rule("archived", "old"), rule("other-owner", "unknown")] }, connection);
    expect(result.realizedBalanceCents).toBe(280000);
    expect(result.payableCents).toBe(20000);
    expect(result.additionalExpenseCents).toBe(40000);
    expect(result.projectedBalanceCents).toBe(220000);
  });

  it("consulta só o dono, apenas caixa, sem transferências ou cancelados; corte é amanhã civil UTC", async () => {
    const { connection, queries } = fixture();
    await getDashboardForecast("owner", ref, { now, expectedIncomeCents: 0, pendingRules: [] }, connection);
    const movement = queries.find(q => q.query.includes('from "transactions"'))!;
    expect(movement.query).toContain('"transactions"."user_id" =');
    expect(movement.query).toContain('"accounts"."user_id" =');
    expect(movement.params.filter(p => p === "owner")).toHaveLength(2);
    expect(movement.query).toContain("<> 'CREDIT_CARD'");
    expect(movement.query).toContain('"transactions"."is_transfer" =');
    expect(movement.params).toContain(false);
    expect(movement.params).toContain("POSTED");
    expect(movement.params).toContain("PENDING");
    expect(movement.params).toContain("2026-11-11T00:00:00.000Z");
    expect(movement.query).toMatch(/group by .*?, .*?, 3$/);
    expect(queries.find(q => q.query.includes('from "accounts"'))!.params).toEqual(["owner"]);
  });

  it("status pendente nunca entra no fechamento histórico e renda cadastrada não substitui realizado", async () => {
    const { connection } = fixture([
      ["INCOME", "FIXED", false, "200000", 1, [], "0"],
      ["EXPENSE", "FIXED", false, "100001", 1, [], "0"],
      ["EXPENSE", "FIXED", true, "50000", 1, [], "0"],
    ]);
    const result = await getDashboardForecast("owner", { year: 2026, month: 10 }, { now, expectedIncomeCents: 600000, pendingRules: [rule("new")] }, connection);
    expect(result.projectedBalanceCents).toBe(99999);
    expect(result.payableCents).toBe(0);
  });

  it("pagamento de fatura sai do caixa uma vez e não vira consumo diário a extrapolar", async () => {
    const { connection, queries } = fixture([
      ["INCOME", "FIXED", false, "300000", 1, [], "0"],
      ["EXPENSE", "VARIABLE", false, "100000", 1, [], "0"],
    ]);
    const result = await getDashboardForecast("owner", ref, { now, expectedIncomeCents: 300000, pendingRules: [] }, connection);
    expect(result).toMatchObject({ realizedExpenseCents: 100000, dailyAvgCents: 0,
      additionalExpenseCents: 0, projectedBalanceCents: 200000 });
    expect(queries[0].query).toContain('"transactions"."is_card_payment" = false');
  });

  it("mês futuro sem lançamentos mas com recorrências mostra planejamento sem média", async () => {
    const { connection } = fixture();
    const result = await getDashboardForecast("owner", { year: 2026, month: 12 }, {
      now, expectedIncomeCents: 0, pendingRules: [rule("salary", "cash", "INCOME"), rule("rent")] }, connection);
    expect(result).toMatchObject({ hasData: true, receivableCents: 10000, payableCents: 10000,
      projectedBalanceCents: 0, dailyAvgCents: 0, daysRemaining: 0 });
  });
});
