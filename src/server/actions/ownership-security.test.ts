import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  userId: "owner-a",
  selectFilters: [] as unknown[],
  updateFilters: [] as unknown[],
  deleteFilters: [] as Array<{ table: unknown; condition: unknown }>,
}));

type SelectBuilder = { from(value: unknown): SelectBuilder; where(condition: unknown): SelectBuilder; limit(): Promise<unknown[]> };
type UpdateBuilder = { set(): UpdateBuilder; where(condition: unknown): UpdateBuilder; then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown): Promise<unknown> };
type DeleteBuilder = { where(condition: unknown): DeleteBuilder; returning(): Promise<unknown[]>; then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown): Promise<unknown> };

vi.mock("@/lib/auth", () => ({ requireUserId: async () => mockState.userId }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      let table: unknown;
      const builder: SelectBuilder = {
        from(value: unknown) { table = value; return builder; },
        where(condition: unknown) { mockState.selectFilters.push(condition); return builder; },
        async limit() { return table === accounts ? [{ id: "account-a", financeMode: "manual" }] : [{ id: "batch-a" }]; },
      };
      return builder;
    },
    update: () => {
      const builder: UpdateBuilder = {
        set() { return builder; },
        where(condition: unknown) { mockState.updateFilters.push(condition); return builder; },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve([]).then(resolve, reject); },
      };
      return builder;
    },
    delete: (table: unknown) => {
      const builder: DeleteBuilder = {
        where(condition: unknown) { mockState.deleteFilters.push({ table, condition }); return builder; },
        async returning() { return []; },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve([]).then(resolve, reject); },
      };
      return builder;
    },
  },
}));

import { accounts, importBatches, transactions } from "@/db/schema";
import { saveOpeningBalance } from "@/server/actions/settings";
import { deleteImportBatch } from "@/server/actions/import";

function referencesColumn(condition: unknown, column: unknown): boolean {
  if (condition === column) return true;
  if (!condition || typeof condition !== "object") return false;
  if (Array.isArray(condition)) return condition.some((item) => referencesColumn(item, column));
  const queryChunks = (condition as { queryChunks?: unknown[] }).queryChunks;
  return Array.isArray(queryChunks) && queryChunks.some((item) => referencesColumn(item, column));
}

describe("ownership predicates on mutations", () => {
  beforeEach(() => {
    mockState.userId = "owner-a";
    mockState.selectFilters.length = 0;
    mockState.updateFilters.length = 0;
    mockState.deleteFilters.length = 0;
  });

  it("scopes opening balance updates to both account ID and user ID", async () => {
    await saveOpeningBalance({ accountId: "account-a", amount: "100" });
    expect(mockState.updateFilters).toHaveLength(1);
    expect(referencesColumn(mockState.updateFilters[0], accounts.id)).toBe(true);
    expect(referencesColumn(mockState.updateFilters[0], accounts.userId)).toBe(true);
  });

  it("scopes import transaction and batch deletions to the authenticated user", async () => {
    await deleteImportBatch("batch-a");
    const transactionDelete = mockState.deleteFilters.find((filter) => filter.table === transactions);
    const batchDelete = mockState.deleteFilters.find((filter) => filter.table === importBatches);
    expect(transactionDelete).toBeDefined();
    expect(batchDelete).toBeDefined();
    expect(referencesColumn(transactionDelete?.condition, transactions.userId)).toBe(true);
    expect(referencesColumn(batchDelete?.condition, importBatches.userId)).toBe(true);
  });
});
