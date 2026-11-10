import { beforeEach, describe, expect, it, vi } from "vitest";

type OwnedRow = {
  transaction: { origin: string; transferGroupId: string | null; installmentGroupId: string | null; invoiceRef: string | null };
  account: { financeMode: string; type: string; closingDay: number | null; dueDay: number | null };
};
const mocks = vi.hoisted(() => ({
  restriction: null as string | null,
  rows: [] as OwnedRow[], splits: [] as { amountCents: number }[],
  changes: [] as Record<string, unknown>[], conditions: [] as unknown[], session: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.session() }));
vi.mock("@/server/usage-profile", () => ({ getProfileRestriction: async () => mocks.restriction }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: async (work: (tx: unknown) => unknown) => {
  return work({
    select: () => ({ from: () => ({
      innerJoin: () => ({ where: (condition: unknown) => { mocks.conditions.push(condition); return { for: () => ({ limit: async () => mocks.rows }) }; } }),
      where: async () => mocks.splits,
    }) }),
    update: () => ({ set: (changes: Record<string, unknown>) => ({ where: async (condition: unknown) => { mocks.changes.push(changes); mocks.conditions.push(condition); } }) }),
  });
} } }));

import { editManualTransaction } from "./edit-transaction";
import { transactions } from "@/db/schema";

function references(value: unknown, target: unknown): boolean {
  if (value === target) return true;
  if (Array.isArray(value)) return value.some((part) => references(part, target));
  if (!value || typeof value !== "object") return false;
  return references((value as { queryChunks?: unknown }).queryChunks, target);
}
const input = { id: "owned-tx", description: "Almoço corrigido", amount: "45,90", date: "2026-11-10" };

describe("manual transaction editing", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.session.mockResolvedValue("owner-a"); mocks.restriction = null;
    mocks.changes = []; mocks.conditions = []; mocks.splits = [];
    mocks.rows = [{ transaction: { origin: "MANUAL", transferGroupId: null, installmentGroupId: null, invoiceRef: null }, account: { financeMode: "manual", type: "CHECKING", closingDay: null, dueDay: null } }];
  });
  it("saves a manual correction in cents without moving accounts or losing annotations", async () => {
    expect(await editManualTransaction(input)).toEqual({ ok: true });
    expect(mocks.changes[0]).toMatchObject({ description: input.description, amountCents: 4590, date: new Date("2026-11-10T12:00:00Z") });
    expect(mocks.changes[0]).not.toHaveProperty("accountId");
    expect(mocks.changes[0]).not.toHaveProperty("notes");
    expect(mocks.conditions.every((condition) => references(condition, transactions.userId))).toBe(true);
  });
  it("rejects foreign/missing records, imported sources and transfer legs", async () => {
    mocks.rows = [];
    expect((await editManualTransaction(input)).error).toBeTruthy();
    for (const origin of ["PLUGGY", "CSV", "OFX"]) {
      mocks.rows = [{ transaction: { origin, transferGroupId: null, installmentGroupId: null, invoiceRef: null }, account: { financeMode: "manual", type: "CHECKING", closingDay: null, dueDay: null } }];
      expect((await editManualTransaction(input)).error).toBeTruthy();
    }
    mocks.rows[0].transaction.origin = "MANUAL"; mocks.rows[0].transaction.transferGroupId = "paired";
    expect((await editManualTransaction(input)).error).toBeTruthy();
    expect(mocks.changes).toHaveLength(0);
  });
  it("preserves splits and rejects a smaller total than the shared parts", async () => {
    mocks.splits = [{ amountCents: 5000 }];
    expect((await editManualTransaction(input)).error).toContain("divisão");
    expect(mocks.changes).toHaveLength(0);
  });
  it("keeps installment invoice references but recalculates ordinary card purchases", async () => {
    mocks.rows[0].account = { financeMode: "manual", type: "CREDIT_CARD", closingDay: 5, dueDay: 15 };
    mocks.rows[0].transaction.installmentGroupId = "installments"; mocks.rows[0].transaction.invoiceRef = "2027-01";
    await editManualTransaction(input);
    expect(mocks.changes[0].invoiceRef).toBe("2027-01");
    mocks.rows[0].transaction.installmentGroupId = null;
    await editManualTransaction(input);
    expect(mocks.changes[1].invoiceRef).toBe("2026-12");
  });
  it.each([{ ...input, amount: "-45" }, { ...input, amount: "NaN" }, { ...input, amount: "20000001" }, { ...input, date: "2026-02-30" }])("rejects invalid money and dates", async (data) => {
    expect((await editManualTransaction(data)).error).toBeTruthy(); expect(mocks.changes).toHaveLength(0);
  });
  it("refuses profile bypass and missing session", async () => {
    mocks.restriction = "Integração total";
    expect((await editManualTransaction(input)).error).toBe(mocks.restriction);
    mocks.session.mockRejectedValue(new Error("unauthenticated"));
    await expect(editManualTransaction(input)).rejects.toThrow("unauthenticated");
    expect(mocks.changes).toHaveLength(0);
  });
});
