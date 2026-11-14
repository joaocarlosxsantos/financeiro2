import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.auth() }));
vi.mock("@/db", () => ({ db: { select: (...args: unknown[]) => mocks.select(...args) } }));
import { connectionOnboardingStatus, getOnboardingJourney, loadOnboardingFacts } from "./onboarding";

const now = new Date("2026-11-14T12:00Z");
function connection(results: unknown[][]) {
  const predicates: SQL[] = [], projections: unknown[] = [];
  const select = vi.fn((fields: unknown) => {
    projections.push(fields); const rows = results.shift() ?? [];
    const q = { from: () => q, innerJoin: () => q, where: (p: SQL) => { predicates.push(p); return q; },
      groupBy: async () => rows, limit: async () => rows, then: (resolve: (r: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
    return q;
  });
  return { select, predicates, projections, db: { select } as unknown as NonNullable<Parameters<typeof loadOnboardingFacts>[1]> };
}
const fixture = (): unknown[][] => [
  [{ profile: "hibrido", onboardedAt: now }],
  [{ id: "local", financeMode: "integracao", connectionId: "connection", linked: true }], [], [{ configured: true }],
  [{ id: "connection", status: "UPDATED", lastAttemptAt: now, lastSyncedAt: now, hasError: false }],
  [], [{ inAppEnabled: false, pushEnabled: false, telegramEnabled: false }], [], [], [],
];
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue("session-owner"); });
describe("Fatos de onboarding autenticados", () => {
  it("todas as fontes são do dono, não leem envelopes/tokens e sync zero é concluído", async () => {
    const d = connection(fixture());
    const facts = await loadOnboardingFacts("owner", d.db, now);
    expect(facts.integration).toEqual({ status: "complete", connections: 1, linkedAccounts: 1, syncedConnections: 1 });
    expect(facts.hasTransaction).toBe(false); expect(facts.notifications.decided).toBe(true);
    for (const predicate of d.predicates) expect(new PgDialect().sqlToQuery(predicate).params).toContain("owner");
    expect(d.select).toHaveBeenCalledTimes(10);
    expect(d.projections.flatMap(p => Object.keys(p as object)).some(k => /secret|envelope|token|chatId|externalAccountId/.test(k))).toBe(false);
    const summaries = new PgDialect().sqlToQuery(d.predicates[9]);
    expect(summaries.params).toContain("DAILY_SUMMARY"); expect(summaries.sql).toContain('"read_at" is not null');
  });
  it("outro dispositivo/relogin recompõe os mesmos fatos; vínculo com um banco não conclui todos", async () => {
    const rows = fixture(); rows[4].push({ id: "second", status: "ERROR", lastAttemptAt: now, lastSyncedAt: now, hasError: true });
    const facts = await loadOnboardingFacts("owner", connection(rows).db, now);
    expect(facts.integration.status).toBe("partial"); expect(facts.integration.syncedConnections).toBe(1);
    expect(await loadOnboardingFacts("owner", connection(fixture()).db, now)).toEqual(await loadOnboardingFacts("owner", connection(fixture()).db, now));
  });
  it("um item UPDATED do widget sem sync local comprovado continua pendente", () => {
    const c = { status: "UPDATED", hasError: false, linkedAccounts: 1, lastAttemptAt: null, lastSyncedAt: null };
    expect(connectionOnboardingStatus(c)).toBe("pending");
    expect(connectionOnboardingStatus({ ...c, lastSyncedAt: new Date("2026-11-01"), lastAttemptAt: now })).toBe("pending");
    expect(connectionOnboardingStatus({ ...c, status: "SYNCING" })).toBe("syncing");
    expect(connectionOnboardingStatus({ ...c, status: "ERROR", hasError: true })).toBe("error");
    expect(connectionOnboardingStatus({ ...c, linkedAccounts: 0 })).toBe("needs_accounts");
  });
  it("a entrada pública usa a sessão e não aceita identidade/flags do navegador", async () => {
    const d = connection(fixture()); mocks.select.mockImplementation(d.select);
    const journey = await getOnboardingJourney();
    expect(journey.storageKey).toContain("session-owner");
    for (const predicate of d.predicates) expect(new PgDialect().sqlToQuery(predicate).params).toContain("session-owner");
    mocks.auth.mockRejectedValue(new Error("unauthenticated"));
    await expect(getOnboardingJourney()).rejects.toThrow("unauthenticated");
  });
});
