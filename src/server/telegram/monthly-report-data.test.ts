import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { loadMonthlyReport, monthlyWindow } from "./monthly-report";

const mocks = vi.hoisted(() => ({ summary: vi.fn(), categories: vi.fn(), balance: vi.fn(async () => ({ availableCents: 1000, investedCents: 2000, netWorthCents: 2500, totalIncomplete: true })) }));
vi.mock("@/db", () => ({ db: { select: () => { throw new Error("use a conexão fornecida"); } } }));
vi.mock("@/server/queries", () => ({ getMonthSummary: mocks.summary, getCategoryBreakdown: mocks.categories, getBalances: mocks.balance }));

describe("dados do relatório mensal", () => {
  it("fecha dezembro no dia 1 de janeiro às 08h de São Paulo", () => {
    expect(monthlyWindow(new Date("2027-01-01T10:59:59Z"))).toBeNull();
    expect(monthlyWindow(new Date("2027-01-02T11:00:00Z"))).toBeNull();
    expect(monthlyWindow(new Date("2027-01-01T11:00:00Z"))).toMatchObject({ key: "2026-12:month", day: "2027-01-01", hour: 8 });
  });

  it("compara o mês parcial até hoje com o mesmo intervalo anterior e usa o dono do vínculo", async () => {
    mocks.summary.mockReset().mockResolvedValueOnce({ incomeCents: 10_000, expenseCents: 7_500 }).mockResolvedValueOnce({ incomeCents: 9_000, expenseCents: 6_000 });
    mocks.categories.mockResolvedValue([{ id: "market", name: "Mercado\nhttps://bad.test", totalCents: 7_500 }]);
    const where = vi.fn().mockResolvedValue([{ categoryId: "market", limitCents: 5_000 }]);
    const innerJoin = vi.fn<(table: unknown, filter: SQL) => { where: typeof where }>(() => ({ where }));
    const connection = { select: () => ({ from: () => ({ innerJoin }) }) } as unknown as NonNullable<Parameters<typeof loadMonthlyReport>[2]>;
    const output = await loadMonthlyReport("linked-owner", new Date("2026-03-30T15:00:00Z"), connection);
    expect(mocks.summary).toHaveBeenNthCalledWith(1, "linked-owner", { year: 2026, month: 3 }, { connection, endExclusive: new Date("2026-03-31T00:00:00Z") });
    expect(mocks.summary).toHaveBeenNthCalledWith(2, "linked-owner", { year: 2026, month: 2 }, { connection, endExclusive: new Date("2026-03-01T00:00:00Z") });
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL).params).toEqual(["linked-owner", 2026, 3]);
    expect(new PgDialect().sqlToQuery(innerJoin.mock.calls[0][1]).params).toEqual(["linked-owner"]);
    expect(output).toContain("Saldo do período");
    expect(output).toContain("25,00");
    expect(output).toContain("Mercado");
    expect(output).toContain("Orçamentos estourados");
    expect(output).not.toContain("https://bad.test");
    expect(output).toContain("Posição atual (parcial) — não é o saldo de fechamento");
    expect(output).toMatch(/Disponível: R\$\s*10,00/);
    expect(output).toMatch(/Investido: R\$\s*20,00/);
    expect(output).toMatch(/Patrimônio líquido: R\$\s*25,00/);
    expect(mocks.balance).toHaveBeenCalledWith("linked-owner", connection);
  });
  it("o automático compara meses fechados e omite seções desativadas", async () => {
    mocks.summary.mockReset().mockResolvedValue({ incomeCents: 0, expenseCents: 0 });
    mocks.categories.mockClear();
    const select = vi.fn(() => { throw new Error("orçamento desativado"); });
    const connection = { select } as unknown as NonNullable<Parameters<typeof loadMonthlyReport>[2]>;
    const output = await loadMonthlyReport("linked-owner", new Date("2027-01-01T11:00:00Z"), connection, { spending: false, budget: false });
    expect(mocks.summary).toHaveBeenNthCalledWith(1, "linked-owner", { year: 2026, month: 12 }, { connection, endExclusive: new Date("2027-01-01T00:00:00Z") });
    expect(mocks.summary).toHaveBeenNthCalledWith(2, "linked-owner", { year: 2026, month: 11 }, { connection, endExclusive: new Date("2026-12-01T00:00:00Z") });
    expect(output).toContain("Fechamento de dezembro de 2026");
    expect(output).not.toMatch(/Maiores categorias|Orçamentos estourados/);
    expect(mocks.categories).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});
