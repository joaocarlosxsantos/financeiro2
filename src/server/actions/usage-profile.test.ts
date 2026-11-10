import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), changed: [{ id: "owner-a" }] as { id: string }[], values: [] as Record<string, unknown>[], conditions: [] as unknown[], revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.session() }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => mocks.revalidate(...args) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/db", () => ({ db: { update: () => ({ set: (value: Record<string, unknown>) => {
  mocks.values.push(value); return { where: (condition: unknown) => { mocks.conditions.push(condition); return { returning: async () => mocks.changed }; } };
} }) } }));
import { saveUsageProfile } from "./usage-profile";
import { completeOnboarding } from "./settings";

function form(profile: string) { const result = new FormData(); result.set("usageProfile", profile); result.set("userId", "someone-else"); return result; }
function hasParameter(value: unknown, target: string): boolean {
  if (Array.isArray(value)) return value.some((part) => hasParameter(part, target));
  if (!value || typeof value !== "object") return false;
  const sqlPart = value as { value?: unknown; queryChunks?: unknown[] };
  return sqlPart.value === target || Boolean(sqlPart.queryChunks?.some((part) => hasParameter(part, target)));
}

describe("saving user profile", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue("owner-a"); mocks.changed = [{ id: "owner-a" }]; mocks.values = []; mocks.conditions = []; });
  it("validates the selection and ignores browser-supplied identity", async () => {
    expect(await saveUsageProfile({}, form("manual"))).toEqual({ ok: true });
    expect(mocks.values[0]).toMatchObject({ usageProfile: "manual" });
    expect(mocks.values[0]).not.toHaveProperty("userId");
    expect(hasParameter(mocks.conditions[0], "owner-a")).toBe(true);
    expect(hasParameter(mocks.conditions[0], "someone-else")).toBe(false);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("does not write an unrecognized profile", async () => {
    expect((await saveUsageProfile({}, form("admin"))).error).toBeTruthy(); expect(mocks.values).toHaveLength(0);
  });
  it("persists the initial onboarding choice before navigation", async () => {
    const initial = form("integracao_total"); initial.set("income", "5400,00");
    initial.set("emergencyMonths", "6"); initial.set("savingsTargetPct", "20");
    await expect(completeOnboarding({}, initial)).rejects.toThrow("redirect:/painel");
    expect(mocks.values[0]).toMatchObject({ usageProfile: "integracao_total", monthlyIncomeCents: 540000 });
    expect(mocks.values[0].onboardedAt).toBeInstanceOf(Date);
  });
  it("does not claim success for a missing user or unauthenticated call", async () => {
    mocks.changed = []; expect((await saveUsageProfile({}, form("hibrido"))).error).toBeTruthy();
    mocks.session.mockRejectedValue(new Error("unauthenticated"));
    await expect(saveUsageProfile({}, form("manual"))).rejects.toThrow("unauthenticated");
  });
});
