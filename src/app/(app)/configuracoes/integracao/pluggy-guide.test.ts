import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluggyCredentialsGuide, PLUGGY_DASHBOARD_URL, PLUGGY_SECURITY_NOTICE } from "./pluggy-guide";

describe("PluggyCredentialsGuide", () => {
  it("links to the official Dashboard in a separate, safe tab", () => {
    expect(PLUGGY_DASHBOARD_URL).toBe("https://dashboard.pluggy.ai");
    const html = renderToStaticMarkup(createElement(PluggyCredentialsGuide));
    expect(html).toContain('href="https://dashboard.pluggy.ai"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("explains that the secret is shown once and must stay private", () => {
    const html = renderToStaticMarkup(createElement(PluggyCredentialsGuide));
    expect(PLUGGY_SECURITY_NOTICE.toLowerCase()).toContain("aparece na gera");
    expect(PLUGGY_SECURITY_NOTICE.toLowerCase()).toContain("nunca o compartilhe");
    expect(html).not.toContain("Client Secret aparece na geração");
  });

  it("renders the six-step didactic guide and secret handling instructions", () => {
    const html = renderToStaticMarkup(createElement(PluggyCredentialsGuide));
    expect(html).toContain("Assistente de configuração Pluggy");
    expect(html).toContain("Client ID e Client Secret");
    expect(html).toContain("Consentimento bancário");
    expect(html).toContain('aria-valuemax="6"');
    expect(html).toContain("Meus próprios dados via Meu Pluggy");
  });
});
