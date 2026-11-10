import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ balance: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: () => { throw new Error("unexpected global pool"); } } }));
vi.mock("@/server/queries", () => ({ getBalances: mocks.balance }));
import { executeReadTool } from "./ai-tools";
beforeEach(() => vi.resetAllMocks());

function connection(results: unknown[][]) {
  const predicates: SQL[] = [];
  const limits: number[] = [];
  const select = vi.fn(() => {
    const rows = results.shift() ?? [];
    const query = {
      from: () => query, leftJoin: () => query,
      where: (predicate: SQL) => { predicates.push(predicate); return query; },
      groupBy: () => query, orderBy: () => query,
      limit: async (limit: number) => { limits.push(limit); return rows; },
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return query;
  });
  return { db: { select } as unknown as NonNullable<Parameters<typeof executeReadTool>[4]>, select, predicates, limits };
}
const sqlQuery = (value: SQL) => new PgDialect().sqlToQuery(value);

describe("ferramentas de leitura por dono", () => {
  it("saldo só devolve agregado, nunca nomes de conta ou identificadores", async () => {
    const conn = connection([]);
    mocks.balance.mockResolvedValue({ availableCents: 1000, totalIncomplete: true, needsOpeningBalance: false, accounts: [{ id: "private", institution: "bank", name: "private" }] });
    expect(await executeReadTool("owner", "get_balance", {}, "2026-11-10", conn.db)).toEqual({ availableCents: 1000, partial: true, checkOpeningBalance: false, currency: "BRL" });
    expect(mocks.balance).toHaveBeenCalledWith("owner", conn.db);
  });
  it.each(["get_spending_by_category", "get_largest_expenses"])("%s filtra usuário/período e limita a cinco sem descrição/nota", async (name) => {
    const conn = connection([[{ category: "Lazer\nhttps://evil.test", amountCents: 1234, date: new Date("2026-11-10T12:00Z"), description: "secret note", userId: "private" }]]);
    const args = { start_date: "2026-11-01", end_date: "2026-11-10", ...(name === "get_largest_expenses" ? { limit: 3 } : {}) };
    const result = await executeReadTool("linked-owner", name, args, "2026-11-10", conn.db);
    expect(conn.limits[0]).toBe(name === "get_largest_expenses" ? 3 : 5);
    const predicate = sqlQuery(conn.predicates[0]);
    expect(predicate.params).toContain("linked-owner");
    expect(predicate.params).toContain("POSTED");
    expect(predicate.sql).toContain('"transactions"."is_transfer"');
    expect(predicate.sql).toContain('"transactions"."is_card_payment"');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret note"); expect(serialized).not.toContain("private"); expect(serialized).not.toContain("https:");
  });
  it("comparativo agrega somente os dois meses e aplica mesmo dono a ambos", async () => {
    const conn = connection([[{ kind: "EXPENSE", total: "1000" }], [{ kind: "INCOME", total: "2000" }]]);
    const result = await executeReadTool("owner", "compare_months", { first_month: "2026-10", second_month: "2026-11" }, "2026-11-10", conn.db);
    expect(result).toEqual({ currency: "BRL", rows: [{ month: "2026-10", incomeCents: 0, expenseCents: 1000 }, { month: "2026-11", incomeCents: 2000, expenseCents: 0 }] });
    expect(conn.predicates).toHaveLength(2);
    for (const predicate of conn.predicates) expect(sqlQuery(predicate).params).toContain("owner");
    expect(sqlQuery(conn.predicates[1]).params).toContain("2026-11-11T00:00:00.000Z");
  });
  it("contas limita vencimentos, não pagas e dono, sem participantes/notas", async () => {
    const conn = connection([[{ name: "Conta", date: "2026-11-11", totalCents: 5000, note: "private" }]]);
    expect(await executeReadTool("owner", "get_due_bills", { days: 3 }, "2026-11-10", conn.db)).toEqual({ currency: "BRL", top: 5, valuesAreWholeBill: true, rows: [{ name: "Conta", date: "2026-11-11", totalCents: 5000 }] });
    const predicate = sqlQuery(conn.predicates[0]);
    expect(predicate.params).toContain("owner"); expect(predicate.params).toContain(false);
    expect(predicate.sql).toContain("least("); expect(conn.limits).toEqual([5]);
  });
  it("ferramenta desconhecida ou identidade no input não chega ao banco", async () => {
    const conn = connection([]);
    await executeReadTool("owner", "get_balance", { user_id: "victim" }, "2026-11-10", conn.db);
    await executeReadTool("owner", "delete_transactions", {}, "2026-11-10", conn.db);
    expect(conn.select).not.toHaveBeenCalled(); expect(mocks.balance).not.toHaveBeenCalled();
  });
});
