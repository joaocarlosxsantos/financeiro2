import { describe, expect, it } from "vitest";
import { getNavigationSections, isDestinationActive, primaryDestinations } from "./navigation-model";
import { USAGE_PROFILES } from "@/lib/usage-profile";

describe("grouped navigation", () => {
  it.each(USAGE_PROFILES)("%s has no empty sections, duplicate routes or orphan destinations", (profile) => {
    const desktop = getNavigationSections(profile, "desktop");
    const more = getNavigationSections(profile, "more");
    for (const sections of [desktop, more]) {
      expect(sections.every((section) => section.items.length > 0)).toBe(true);
      const routes = sections.flatMap((section) => section.items.map((item) => item.href));
      expect(new Set(routes).size).toBe(routes.length);
      expect(routes).not.toContain("/usuario"); // Account lives only in the user footer.
    }
    const desktopRoutes = desktop.flatMap((section) => section.items.map((item) => item.href));
    const mobileRoutes = [...primaryDestinations, ...more.flatMap((section) => section.items)].map((item) => item.href);
    expect(new Set(mobileRoutes).size).toBe(mobileRoutes.length);
    expect([...mobileRoutes].sort()).toEqual([...desktopRoutes].sort());
  });
  it("keeps all destinations in hybrid and omits only profile-restricted routes", () => {
    const routes = (profile: "hibrido" | "manual" | "integracao_total") => getNavigationSections(profile, "desktop").flatMap((section) => section.items.map((item) => item.href));
    expect(routes("hibrido").sort()).toEqual(["/painel", "/insights", "/lancamentos", "/contas", "/recorrentes", "/importar", "/contas-a-pagar", "/orcamento", "/metas", "/dividas", "/projecoes", "/configuracoes/integracao", "/configuracoes"].sort());
    expect(getNavigationSections("manual", "desktop").map((section) => section.label)).not.toContain("Integração");
    expect(getNavigationSections("integracao_total", "more").map((section) => section.label)).not.toContain("Movimentações");
    expect(routes("integracao_total")).not.toContain("/importar");
    expect(routes("integracao_total")).not.toContain("/recorrentes");
  });
  it("marks only the most specific active destination", () => {
    expect(isDestinationActive("/configuracoes/integracao", "/configuracoes")).toBe(false);
    expect(isDestinationActive("/configuracoes/integracao", "/configuracoes/integracao")).toBe(true);
    expect(isDestinationActive("/usuario", "/usuario")).toBe(true);
    expect(isDestinationActive("/contas-a-pagar", "/contas")).toBe(false);
    expect(isDestinationActive("/contas/historico", "/contas")).toBe(true);
  });
  it("uses 'Lançamentos' as unified label for /lancamentos destination", () => {
    const item = primaryDestinations.find((d) => d.href === "/lancamentos");
    expect(item?.label).toBe("Lançamentos");
  });
});
