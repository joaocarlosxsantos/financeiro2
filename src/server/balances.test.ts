import { beforeEach, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { accounts } from "@/db/schema";
import { getBalances } from "./queries";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle((...args) => query(...args)) };
});

beforeEach(() => { query.mockReset(); });

it("separates manual and integrated investments from available cash, keeping both in net worth", async () => {
  const fixture = (id: string, type: string, financeMode: string, openingBalanceCents: number, bankBalanceCents: number | null) => ({
    id, userId: "owner", name: id, type, financeMode, openingBalanceCents, bankBalanceCents,
    color: "#294f59", archived: false, createdAt: "2026-01-01T00:00:00Z",
  });
  const rows = [
    fixture("cash", "CHECKING", "manual", 10000, null),
    fixture("manual-investment", "INVESTMENT", "manual", 20000, null),
    fixture("pluggy-investment", "INVESTMENT", "integracao", 99999, 30000),
    fixture("card", "CREDIT_CARD", "manual", 88888, null),
  ];
  query.mockImplementation(async (statement: string, params: unknown[]) => {
    expect(params).toContain("owner");
    if (statement.includes('from "transactions"')) return { rows: [["cash", "INCOME", 1000, 1], ["manual-investment", "EXPENSE", 2000, 1], ["pluggy-investment", "INCOME", 500000, 1]] };
    if (statement.includes('from "goals"')) return { rows: [[5000]] };
    if (statement.includes('from "debts"')) return { rows: [[3000]] };
    return { rows: rows.map((row) => Object.keys(getTableColumns(accounts)).map((key) => row[key as keyof typeof row] ?? null)) };
  });

  const result = await getBalances("owner");
  expect(result).toMatchObject({ availableCents: 11000, investedCents: 48000, savedInGoalsCents: 5000, debtBalanceCents: 3000, netWorthCents: 61000, totalIncomplete: false });
  expect(result.accounts.map((row) => row.id)).not.toContain("card");
});

it("returns zero investedCents when there are no accounts", async () => {
  query.mockResolvedValue({ rows: [] });
  expect(await getBalances("owner")).toMatchObject({ investedCents: 0, availableCents: 0, netWorthCents: 0 });
});

it("marks a missing investment snapshot as incomplete", async () => {
  const row: Record<string, unknown> = { id: "investment", userId: "owner", name: "Investment", type: "INVESTMENT", financeMode: "integracao", openingBalanceCents: 99999, color: "#294f59", archived: false, createdAt: "2026-01-01T00:00:00Z" };
  query.mockImplementation(async (statement: string) => ({ rows: statement.includes('from "accounts"') ? [Object.keys(getTableColumns(accounts)).map((key) => row[key] ?? null)] : [] }));
  expect(await getBalances("owner")).toMatchObject({ investedCents: 0, availableCents: 0, totalIncomplete: true });
});
