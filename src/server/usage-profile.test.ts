import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], where: vi.fn(), select: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.session() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/db", () => ({ db: { select: (...args: unknown[]) => {
  mocks.select(...args);
  return { from: () => ({ where: (condition: unknown) => { mocks.where(condition); return { limit: async () => mocks.rows }; } }) };
} } }));

import { getProfileRestriction, getUsageProfile, requireProfileRoute } from "./usage-profile";

describe("current profile authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows = [{ usageProfile: "hibrido" }]; mocks.session.mockResolvedValue("owner-a"); });
  it("rereads DB policy, so a changed profile takes effect without a new JWT", async () => {
    expect(await getProfileRestriction("owner-a", "manual-entry")).toBeNull();
    mocks.rows = [{ usageProfile: "integracao_total" }];
    expect(await getProfileRestriction("owner-a", "manual-entry")).toContain("Minha conta");
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.where).toHaveBeenCalledTimes(2);
  });
  it("fails closed for a deleted user or invalid persisted policy", async () => {
    mocks.rows = [];
    await expect(getUsageProfile("missing")).rejects.toThrow();
    mocks.rows = [{ usageProfile: "unknown" }];
    await expect(getUsageProfile("owner-a")).rejects.toThrow();
  });
  it("redirects a direct visit to hidden routes on the server", async () => {
    mocks.rows = [{ usageProfile: "manual" }];
    await expect(requireProfileRoute("/configuracoes/integracao")).rejects.toThrow("redirect:/painel");
    mocks.rows = [{ usageProfile: "integracao_total" }];
    await expect(requireProfileRoute("/importar")).rejects.toThrow("redirect:/painel");
    await expect(requireProfileRoute("/recorrentes")).rejects.toThrow("redirect:/painel");
    expect(await requireProfileRoute("/metas")).toEqual({ userId: "owner-a", profile: "integracao_total" });
  });
  it("checks session before any route policy read", async () => {
    mocks.session.mockRejectedValue(new Error("unauthenticated"));
    await expect(requireProfileRoute("/importar")).rejects.toThrow("unauthenticated");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
