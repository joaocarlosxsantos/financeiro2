import { describe, expect, it } from "vitest";
import { deriveOnboardingJourney, emptyOnboardingLocalState, getOnboardingTour, onboardingCalibrationSchema, onboardingStorageKey,
  parseOnboardingLocalState, readOnboardingLocalState, summarizeInitialOnboardingSync, transitionOnboardingLocalState, writeOnboardingLocalState, type OnboardingFacts } from "./onboarding";
import { canVisitRoute } from "./usage-profile";

const facts = (patch: Partial<OnboardingFacts> = {}): OnboardingFacts => ({ registered: true, profile: "manual", modeChosen: true, hasAccount: true,
  hasTransaction: false, hasManualTransaction: false, credentialConfigured: false,
  integration: { status: "not_started", connections: 0, linkedAccounts: 0, syncedConnections: 0 }, hasBudget: false,
  notifications: { decided: false, inAppEnabled: false, pushEnabled: false, pushRegisteredOnAnyDevice: false, telegramEnabled: false, telegramLinked: false },
  hasReadSummary: false, ...patch,
});

describe("Trilha derivada de sete etapas", () => {
  it("onboardedAt e contas iniciais não concluem o restante nem provam revisão/visualização", () => {
    const journey = deriveOnboardingJourney(facts());
    expect(journey.completedCount).toBe(2); expect(journey.applicableCount).toBe(6); expect(journey.notApplicableCount).toBe(1);
    expect(journey.steps.find(s => s.id === "planning")?.status).toBe("pendente");
    expect(journey.steps.find(s => s.id === "summary")?.status).toBe("em_andamento"); expect(journey.complete).toBe(false);
  });
  it("pular é local e não é conclusão, fatos reais prevalecem e mudar modo recalcula aplicabilidade", () => {
    const local = transitionOnboardingLocalState(emptyOnboardingLocalState(), { type: "skip", stepId: "first-data" }, "manual");
    expect(deriveOnboardingJourney(facts(), local).steps.find(s => s.id === "first-data")?.status).toBe("pulado");
    expect(deriveOnboardingJourney(facts(), local).completedCount).toBe(2);
    expect(deriveOnboardingJourney(facts({ hasManualTransaction: true }), local).steps.find(s => s.id === "first-data")?.status).toBe("concluido");
    expect(deriveOnboardingJourney(facts({ profile: "hibrido" }), local).applicableCount).toBe(7);
    expect(transitionOnboardingLocalState(local, { type: "skip", stepId: "registration" }, "manual").skippedSteps).not.toContain("registration");
    expect(transitionOnboardingLocalState(local, { type: "resume-step", stepId: "first-data" }, "manual").skippedSteps).toEqual([]);
  });
  it("sync confirmado sem transações conclui primeiros dados, parcial não", () => {
    const integrated = facts({ profile: "integracao_total", integration: { status: "complete", connections: 2, linkedAccounts: 3, syncedConnections: 2 } });
    expect(deriveOnboardingJourney(integrated).steps.find(s => s.id === "first-data")?.status).toBe("concluido");
    integrated.integration.status = "partial";
    expect(deriveOnboardingJourney(integrated).steps.find(s => s.id === "first-data")?.status).toBe("em_andamento");
  });
  it("recusar canais é decisão válida, assinatura push/Telegram não prova decisão ou entrega", () => {
    const input = facts(); input.notifications.decided = true;
    expect(deriveOnboardingJourney(input).steps.find(s => s.id === "notifications")?.status).toBe("concluido");
    input.notifications.decided = false; input.notifications.telegramLinked = true;
    expect(deriveOnboardingJourney(input).steps.find(s => s.id === "notifications")?.status).toBe("em_andamento");
  });
});

describe("Tour e armazenamento exclusivamente local", () => {
  it("reutiliza permissões, pausa/retoma e só reabre após comando explícito", () => {
    for (const profile of ["manual", "hibrido", "integracao_total"] as const) {
      expect(getOnboardingTour(profile).every(s => s.routes.every(r => canVisitRoute(profile, r.href)))).toBe(true);
    }
    let state = transitionOnboardingLocalState(emptyOnboardingLocalState(), { type: "tour-start" }, "manual");
    state = transitionOnboardingLocalState(state, { type: "tour-go", stopId: "planning" }, "manual");
    state = transitionOnboardingLocalState(state, { type: "tour-pause" }, "manual");
    expect(transitionOnboardingLocalState(state, { type: "tour-resume" }, "manual").tour).toEqual({ status: "active", stopId: "planning" });
    state = transitionOnboardingLocalState(state, { type: "tour-dismiss" }, "manual");
    expect(transitionOnboardingLocalState(state, { type: "tour-resume" }, "manual").tour.status).toBe("dismissed");
    expect(transitionOnboardingLocalState(state, { type: "tour-start" }, "manual").tour.status).toBe("active");
    expect(getOnboardingTour("manual").some(s => s.id === "integration")).toBe(false);
  });
  it("isola usuários, ignora injeção de fatos/segredos e preserva dispensa em nova versão", () => {
    const map = new Map<string, string>(), storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
    const state = parseOnboardingLocalState({ version: 0, skippedSteps: ["registration", "planning", "unknown"], tour: { status: "completed", stopId: null }, clientSecret: "do-not-store", completedCount: 7 });
    expect(writeOnboardingLocalState(storage, "owner-a", state)).toBe(true);
    expect(readOnboardingLocalState(storage, "owner-a").tour.status).toBe("completed");
    expect(readOnboardingLocalState(storage, "owner-b").skippedSteps).toEqual([]);
    expect(map.get(onboardingStorageKey("owner-a"))).not.toContain("do-not-store");
    expect(state.skippedSteps).toEqual(["planning"]);
    expect(parseOnboardingLocalState("{bad json")).toEqual(emptyOnboardingLocalState());
    expect(readOnboardingLocalState({ getItem: () => { throw new Error("blocked"); } }, "owner")).toEqual(emptyOnboardingLocalState());
  });
});

describe("Calibração e confirmação de sync", () => {
  it.each(["-50", "0", "Infinity", "1e9", "texto 10", "1.2.3"])("renda inválida não vira valor inventado: %s", income => {
    expect(onboardingCalibrationSchema.safeParse({ usageProfile: "manual", income }).success).toBe(false);
  });
  it("valida renda brasileira e limites inteiros de reserva/percentual", () => {
    expect(onboardingCalibrationSchema.parse({ usageProfile: "manual", income: "5.400,00" }).income).toBe(540000);
    expect(onboardingCalibrationSchema.parse({ usageProfile: "manual", income: "5400.00" }).income).toBe(540000);
    expect(onboardingCalibrationSchema.safeParse({ usageProfile: "manual", income: "10", emergencyMonths: 1.5 }).success).toBe(false);
    expect(onboardingCalibrationSchema.safeParse({ usageProfile: "manual", income: "10", savingsTargetPct: 100 }).success).toBe(false);
  });
  it("não confunde conectado/skipped/parcial com sync completo; zero transações é válido", () => {
    expect(summarizeInitialOnboardingSync({ ok: true }).state).toBe("failed");
    expect(summarizeInitialOnboardingSync({ skipped: true }).state).toBe("pending");
    expect(summarizeInitialOnboardingSync({ ok: true, status: "ERROR", accounts: [{ status: "OK" }, { status: "ERROR", error: "secret" }] }).state).toBe("partial");
    expect(summarizeInitialOnboardingSync({ ok: true, status: "UPDATED", imported: 0, accounts: [{ status: "OK" }] })).toEqual({ state: "completed", accountCount: 1, imported: 0 });
    expect(JSON.stringify(summarizeInitialOnboardingSync({ error: "clientSecret=secret" }))).not.toContain("secret");
  });
});
