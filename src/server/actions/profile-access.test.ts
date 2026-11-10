import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: "integracao_total" as "integracao_total" | "hibrido" | "manual",
  session: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.session() }));
vi.mock("@/server/usage-profile", async () => {
  const { profileRestriction } = await import("@/lib/usage-profile");
  return { getProfileRestriction: async (_userId: string, capability: "manual-entry" | "integration") => profileRestriction(mocks.profile, capability) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: (...args: unknown[]) => mocks.select(...args), insert: (...args: unknown[]) => mocks.insert(...args), update: (...args: unknown[]) => mocks.update(...args) } }));

import { createTransaction, createTransfer } from "./transactions";
import { previewImport, commitImport } from "./import";
import { createRecurringRule, generateRecurring } from "./recurring";
import { createAccount, saveOpeningBalance } from "./settings";
import { saveOpenFinanceSetup, discoverOpenFinanceAccounts, syncOpenFinance, autoSyncOpenFinance } from "./open-finance";

describe("direct server action profile enforcement", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.profile = "integracao_total"; mocks.session.mockResolvedValue("owner-a"); });
  it("refuses manual creation before DB mutations, even bypassing the UI", async () => {
    const actions = [
      () => createTransaction({}, new FormData()),
      () => createTransfer("a", "b", 100, "2026-11-10"),
      () => previewImport({}), () => commitImport({}),
      () => createRecurringRule({}, new FormData()),
      () => generateRecurring({ year: 2026, month: 11 }),
      () => saveOpeningBalance({ accountId: "a", amount: "10,00", date: null }),
      () => createAccount({}, new FormData()),
    ];
    for (const action of actions) expect((await action()).error).toContain("Minha conta");
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuses integration and auto-sync in manual profile before network or DB access", async () => {
    mocks.profile = "manual";
    for (const action of [() => saveOpenFinanceSetup({}), () => discoverOpenFinanceAccounts("connection"), () => syncOpenFinance("connection"), () => autoSyncOpenFinance()]) expect((await action()).error).toContain("Somente manual");
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each(["manual", "hibrido"] as const)("%s reaches ordinary input validation for manual entries", async (profile) => {
    mocks.profile = profile;
    const result = await createTransaction({}, new FormData());
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("Minha conta");
  });
  it.each(["manual", "hibrido"] as const)("%s can create an account owned by the session", async (profile) => {
    mocks.profile = profile;
    const values = vi.fn().mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values });
    const form = new FormData(); form.set("name", "Conta principal"); form.set("type", "CHECKING");
    form.set("userId", "someone-else");
    expect(await createAccount({}, form)).toEqual({ ok: true });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-a", name: "Conta principal" }));
  });
  it("rejects even a valid account form in integration-only mode without writing", async () => {
    const form = new FormData(); form.set("name", "Conta principal"); form.set("type", "CHECKING");
    expect((await createAccount({}, form)).error).toContain("Minha conta");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not trust an unauthenticated request", async () => {
    mocks.session.mockRejectedValue(new Error("unauthenticated"));
    await expect(createTransaction({}, new FormData())).rejects.toThrow("unauthenticated");
    await expect(createAccount({}, new FormData())).rejects.toThrow("unauthenticated");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
