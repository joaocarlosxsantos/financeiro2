import { describe, expect, it } from "vitest";
import { canUseCapability, canVisitRoute, isUsageProfile, profileRestriction, USAGE_PROFILES } from "./usage-profile";

describe("usage profiles", () => {
  it.each([
    ["integracao_total", false, true], ["hibrido", true, true], ["manual", true, false],
  ] as const)("%s exposes its allowed sources", (profile, manual, integration) => {
    expect(canUseCapability(profile, "manual-entry")).toBe(manual);
    expect(canUseCapability(profile, "integration")).toBe(integration);
    expect(Boolean(profileRestriction(profile, "manual-entry"))).toBe(!manual);
    expect(Boolean(profileRestriction(profile, "integration"))).toBe(!integration);
  });
  it("recognizes only the explicit, stable persisted values", () => {
    for (const value of [null, undefined, "", "admin", "INTEGRATION", {}, 1]) expect(isUsageProfile(value)).toBe(false);
    for (const value of USAGE_PROFILES) expect(isUsageProfile(value)).toBe(true);
  });
  it("protects direct and nested routes while leaving planning available", () => {
    for (const route of ["/importar", "/importar/revisao", "/recorrentes"]) {
      expect(canVisitRoute("integracao_total", route)).toBe(false);
      expect(canVisitRoute("manual", route)).toBe(true);
    }
    expect(canVisitRoute("manual", "/configuracoes/integracao")).toBe(false);
    expect(canVisitRoute("manual", "/configuracoes/integracao/contas")).toBe(false);
    for (const profile of USAGE_PROFILES) {
      for (const route of ["/painel", "/lancamentos", "/contas", "/usuario", "/configuracoes", "/metas", "/orcamento", "/contas-a-pagar", "/dividas"]) expect(canVisitRoute(profile, route)).toBe(true);
    }
  });
});
