import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/lancamentos", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams(state.params) }));
import { Filters } from "./filters";

it("oferece contas integradas de investimento e reconhece o filtro accountId", () => {
  state.params = "accountId=investment";
  const html = renderToStaticMarkup(createElement(Filters, { categories: [], accounts: [{ id: "investment", name: "Carteira", type: "INVESTMENT" }] }));
  expect(html).toContain('aria-label="Filtrar por conta"');
  expect(html).toContain('<option value="investment" selected="">Carteira · Investimento</option>');
  expect(html).toContain("Limpar");
});
