import { describe, expect, it, vi } from "vitest";
vi.mock("./site-chat.module.css", () => ({ default: { anchor: "anchor", panel: "panel" } }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatCommandMenu, ChatTranscript, SITE_CHAT_GREETING } from "./site-chat";
import { SITE_CHAT_COMMANDS, floatingChatBottom, isSiteChatCommand } from "@/lib/site-chat";
import { BOT_COMMANDS } from "@/server/telegram/commands";

describe("Chat acessível e menu compartilhado", () => {
  it("mantém uma saudação própria sem afirmar equivalência com o Telegram", () => {
    expect(SITE_CHAT_GREETING.text).toBe("Olá! Escolha um comando para consultar suas contas.");
    expect(SITE_CHAT_GREETING.text).not.toMatch(/respostas?.{0,40}telegram|telegram.{0,40}respostas?/i);
  });
  it("expõe todos os comandos publicados pelo bot e somente comandos exatos", () => {
    for (const item of BOT_COMMANDS) expect(SITE_CHAT_COMMANDS.some(c => c.command === `/${item.command}`)).toBe(true);
    expect(isSiteChatCommand("/resumo semana")).toBe(true); expect(isSiteChatCommand("/saldo other-owner")).toBe(false);
    const html = renderToStaticMarkup(createElement(ChatCommandMenu, { busy: true, onSelect: () => {} }));
    expect(html).toContain("Pausar avisos"); expect(html).toContain("disabled"); expect(html).toContain("min-h-11");
  });
  it("mantém texto financeiro literal, linhas e anúncio acessível sem executar HTML", () => {
    const html = renderToStaticMarkup(createElement(ChatTranscript, { busy: false, messages: [{ id: 1, role: "assistant", text: '<script>alert(1)</script>\nR$ 10,00' }] }));
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).toContain("whitespace-pre-wrap"); expect(html).toContain('role="log"');
  });
  it("separa o ícone da navegação mobile e do banner de instalação, inclusive em paisagem", () => {
    expect(floatingChatBottom(800, { left: 16, right: 64 }, [{ left: 0, right: 390, top: 720, height: 80 }])).toBe(96);
    expect(floatingChatBottom(800, { left: 16, right: 64 }, [{ left: 16, right: 374, top: 550, height: 150 }])).toBe(266);
    expect(floatingChatBottom(900, { left: 248, right: 296 }, [{ left: 900, right: 1280, top: 700, height: 180 }])).toBe(24);
    expect(floatingChatBottom(390, { left: 16, right: 64 }, [{ left: 0, right: 800, top: 318, height: 72 }])).toBe(88);
    expect(floatingChatBottom(844, { left: 326, right: 374 }, [{ left: 0, right: 390, top: 756, height: 88 }])).toBe(104);
    expect(floatingChatBottom(720, { left: 1208, right: 1256 }, [{ left: 900, right: 1280, top: 700, height: 20 }])).toBe(36);
  });
});
