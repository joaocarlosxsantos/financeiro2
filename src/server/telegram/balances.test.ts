import { describe, expect, it, vi } from "vitest";

// Qualquer escape da transação para o pool global deve falhar neste teste.
vi.mock("@/db", () => ({ db: { select: () => { throw new Error("global pool must not be used"); } } }));
import { getBalances } from "@/server/queries";

describe("saldo Telegram na conexão da transação", () => {
  it("mantém todas as leituras na mesma conexão e reutiliza regras de saldo do app", async () => {
    const account = { name: "Conta", type: "CHECKING", institution: null, color: "#000000", openingBalanceCents: 1000, openingBalanceDate: null, financeMode: "manual", bankBalanceCents: null, bankBalanceAt: null };
    const results = [
      [{ ...account, id: "manual" }, { ...account, id: "integrated", financeMode: "integracao", bankBalanceCents: 2000 }, { ...account, id: "card", type: "CREDIT_CARD", openingBalanceCents: 99999 }],
      [{ accountId: "manual", kind: "INCOME", total: 500, count: 1 }, { accountId: "manual", kind: "EXPENSE", total: 200, count: 1 }],
      [{ total: 100 }],
      [{ total: 300 }],
    ];
    const select = vi.fn(() => {
      const rows = results.shift();
      const query = {
        from: () => query, where: () => query, innerJoin: () => query,
        orderBy: async () => rows, groupBy: async () => rows,
        then: (resolve: (rows: unknown) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    });
    const connection = { select } as unknown as NonNullable<Parameters<typeof getBalances>[1]>;
    const result = await getBalances("linked-owner", connection);
    expect(select).toHaveBeenCalledTimes(4);
    expect(result.accounts.map((a) => a.id)).toEqual(["manual", "integrated"]);
    expect(result.availableCents).toBe(3300);
    expect(result.netWorthCents).toBe(3100);
    expect(result.totalIncomplete).toBe(false);
  });
});
