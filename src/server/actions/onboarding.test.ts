import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), revalidate: vi.fn(), values: [] as Record<string, unknown>[], predicates: [] as SQL[], changed: [{ id: "owner" }] }));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.auth() }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => mocks.revalidate(...args) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/db", () => ({ db: { update: () => ({ set: (values: Record<string, unknown>) => { mocks.values.push(values); return {
  where: (predicate: SQL) => { mocks.predicates.push(predicate); return { returning: async () => mocks.changed }; },
}; } }) } }));
import { skipOnboardingCalibration } from "./onboarding";
import { completeOnboarding } from "./settings";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue("owner"); mocks.values.length = mocks.predicates.length = 0; mocks.changed = [{ id: "owner" }]; });
const form = (profile = "manual") => { const f = new FormData(); f.set("usageProfile", profile); f.set("userId", "attacker"); return f; };
describe("Adiar calibração sem burlar guarda nem inventar renda", () => {
  it("salva modo explicitamente, preserva renda/reserva e usa somente o dono autenticado", async () => {
    await expect(skipOnboardingCalibration({}, form())).rejects.toThrow("redirect:/painel");
    expect(mocks.values[0]).toHaveProperty("onboardedAt"); expect(mocks.values[0]).not.toHaveProperty("monthlyIncomeCents");
    expect(mocks.values[0]).not.toHaveProperty("emergencyMonths");
    expect(new PgDialect().sqlToQuery(mocks.predicates[0]).params).toEqual(["owner"]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("não aceita modo inválido, usuário removido ou sessão ausente", async () => {
    expect((await skipOnboardingCalibration({}, form("admin"))).error).toBeTruthy(); expect(mocks.values).toHaveLength(0);
    mocks.changed = []; expect((await skipOnboardingCalibration({}, form())).error).toBeTruthy();
    mocks.auth.mockRejectedValue(new Error("unauthenticated")); await expect(skipOnboardingCalibration({}, form())).rejects.toThrow("unauthenticated");
  });
  it("conclusão normal rejeita renda negativa e limites de calibração adulterados", async () => {
    for (const [key, value] of [["income", "-10"], ["emergencyMonths", "999"], ["savingsTargetPct", "NaN"]]) {
      const f = form(); f.set("income", "1000,00"); f.set(key, value);
      expect((await completeOnboarding({}, f)).error).toBeTruthy();
    }
    expect(mocks.values).toHaveLength(0);
  });
});
