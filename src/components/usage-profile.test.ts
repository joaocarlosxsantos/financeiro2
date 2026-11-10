import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/painel", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/server/actions/transactions", () => ({ createTransaction: vi.fn(), createTransfer: vi.fn() }));
vi.mock("@/server/actions/settings", () => ({ createAccount: vi.fn() }));
import { Sidebar } from "./sidebar";
import { UsageProfileProvider } from "./usage-profile";
import type { UsageProfile } from "@/lib/usage-profile";
import { NewAccount } from "@/app/(app)/contas/new-account";

function markup(profile: UsageProfile) {
  return renderToStaticMarkup(createElement(UsageProfileProvider, { profile }, createElement(Sidebar, { userName: "QA", userEmail: "qa@example.invalid", accounts: [], categories: [] })));
}
describe("profile-aware shell", () => {
  it("hides account creation in integration-only mode and keeps it for manual/hybrid", () => {
    for (const profile of ["integracao_total", "manual", "hibrido"] as const) {
      const html = renderToStaticMarkup(createElement(UsageProfileProvider, { profile }, createElement(NewAccount)));
      if (profile === "integracao_total") expect(html).toBe("");
      else expect(html).toContain("Criar conta");
    }
  });
  it("does not render any manual entry or import shortcut in integration-only mode", () => {
    const html = markup("integracao_total");
    expect(html).not.toContain('aria-label="Novo lançamento"');
    expect(html).not.toContain('href="/importar"');
    expect(html).not.toContain('href="/recorrentes"');
    expect(html).toContain('href="/configuracoes/integracao"');
    expect(html).toContain('href="/usuario"');
  });
  it("renders manual entry but hides integration links in manual mode", () => {
    const html = markup("manual");
    expect(html).toContain('aria-label="Novo lançamento"');
    expect(html).toContain('href="/importar"');
    expect(html).not.toContain('href="/configuracoes/integracao"');
  });
  it("keeps both paths and planning in hybrid mode", () => {
    const html = markup("hibrido");
    for (const route of ["/importar", "/configuracoes/integracao", "/metas", "/orcamento", "/contas-a-pagar", "/dividas"]) expect(html).toContain(`href="${route}"`);
  });
});
