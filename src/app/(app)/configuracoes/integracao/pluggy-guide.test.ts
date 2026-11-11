import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PluggyCredentialsGuide,
  PLUGGY_DASHBOARD_URL,
  PLUGGY_SECURITY_NOTICE,
} from "./pluggy-guide";

describe("PluggyCredentialsGuide (F18 UX Open Finance)", () => {
  it("utiliza a URL oficial e constante da Pluggy sem aceitar input de usuário", () => {
    expect(PLUGGY_DASHBOARD_URL).toBe("https://dashboard.pluggy.ai");
  });

  it("renderiza o botão/link oficial com target blank e rel noopener noreferrer", () => {
    const html = renderToStaticMarkup(createElement(PluggyCredentialsGuide));

    expect(html).toContain('href="https://dashboard.pluggy.ai"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Criar minha conta e obter credenciais na Pluggy");
  });

  it("exibe o aviso obrigatório de segurança sobre credenciais gratuitas e sigilo", () => {
    const html = renderToStaticMarkup(createElement(PluggyCredentialsGuide));

    expect(PLUGGY_SECURITY_NOTICE.toLowerCase()).toContain("credenciais gratuitas são pessoais (até 5 conexões)");
    expect(PLUGGY_SECURITY_NOTICE.toLowerCase()).toContain("nunca compartilhe o client secret");
    expect(html).toContain(PLUGGY_SECURITY_NOTICE);
  });

  it("renderiza lista ordenada semântica (ol) com os termos exatos da documentação oficial da Pluggy", () => {
    const html = renderToStaticMarkup(createElement(PluggyCredentialsGuide));

    // Elemento semântico de acessibilidade para tecnologias assistivas
    expect(html).toContain("<ol");
    expect(html).toContain("Applications");
    expect(html).toContain("Client ID");
    expect(html).toContain("Client Secret");
    expect(html).toContain("dashboard.pluggy.ai");
  });
});
