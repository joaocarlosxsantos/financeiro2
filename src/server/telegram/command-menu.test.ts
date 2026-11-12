import { describe, expect, it, vi } from "vitest";
import { BOT_COMMANDS, HELP, LINKED_WELCOME } from "./commands";
import { registerCommandMenu } from "./command-menu";
import { commandReply, type TelegramMessage } from "./protocol";
import { handleWebhook } from "./webhook";

const message: TelegramMessage = { text: "oi", chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } };
const request = (msg: unknown = message, secret = "secret") => new Request("https://app.test/api/telegram/webhook", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 1, message: msg }),
});

describe("menu de comandos Telegram", () => {
  it("registra catálogo único apenas no chat autorizado, sem escopo global nem parse_mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, result: true }));
    expect(await registerCommandMenu("123", "fake-test-token", fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/botfake-test-token/setMyCommands", expect.objectContaining({
      method: "POST", cache: "no-store", signal: expect.any(AbortSignal),
    }));
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({ commands: BOT_COMMANDS, scope: { type: "chat", chat_id: "123" }, language_code: "" });
    expect(body).not.toHaveProperty("parse_mode");
    for (const c of body.commands) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(256);
      expect(HELP).toContain(`/${c.command} — ${c.description}`);
    }
  });
  it.each([undefined, ""])("sem token não chama rede", async token => {
    const fetcher = vi.fn(); expect(await registerCommandMenu("123", token, fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["-123", "@other_chat", "123/path", "https://bad.test", "9007199254740992"])("rejeita chat inválido %s antes da rede", async chat => {
    const fetcher = vi.fn(); expect(await registerCommandMenu(chat, "fake-test-token", fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("erro ou timeout da API não vaza detalhes nem impede retry posterior", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("fake-test-token private-api-error"))
      .mockResolvedValueOnce(Response.json({ ok: false }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    expect(await registerCommandMenu("123", "fake-test-token", fetcher)).toBe(false);
    expect(await registerCommandMenu("123", "fake-test-token", fetcher)).toBe(false);
    expect(await registerCommandMenu("123", "fake-test-token", fetcher)).toBe(true);
  });
  it.each([HELP, LINKED_WELCOME])("boas-vindas autorizadas registram menu e preservam texto puro", async reply => {
    const register = vi.fn();
    const response = await handleWebhook(request(), "secret", vi.fn().mockResolvedValue(reply), register);
    expect(register).toHaveBeenCalledWith("123");
    expect(await response.json()).toEqual({ method: "sendMessage", chat_id: 123, text: reply, protect_content: true });
  });
  it("falha do registro mantém boas-vindas, sem cair na mensagem de erro financeiro", async () => {
    const response = await handleWebhook(request(), "secret", vi.fn().mockResolvedValue(HELP), vi.fn().mockRejectedValue(new Error("private-provider-details")));
    expect((await response.json()).text).toBe(HELP);
  });
  it.each([null, "Vincule seu Telegram em Configurações.", "Saldo R$ 10,00"])("resposta sem boas-vindas não registra menu", async reply => {
    const register = vi.fn();
    await handleWebhook(request(), "secret", vi.fn().mockResolvedValue(reply), register);
    expect(register).not.toHaveBeenCalled();
  });
  it("segredo errado/grupo/bot/identidade divergente não processam nem registram menu", async () => {
    const register = vi.fn(), process = vi.fn().mockResolvedValue(HELP);
    await handleWebhook(request(message, "wrong"), "secret", process, register);
    for (const msg of [
      { ...message, chat: { id: -123, type: "group" } },
      { ...message, from: { id: 123, is_bot: true } },
      { ...message, from: { id: 456, is_bot: false } },
    ]) await handleWebhook(request(msg), "secret", process, register);
    expect(process).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled();
  });
  it("pipeline real de comando sem vínculo não dá boas-vindas nem registra menu", async () => {
    const register = vi.fn();
    const response = await handleWebhook(request(), "secret", (_id, msg) => commandReply(msg, {
      linkedUser: vi.fn().mockResolvedValue(null), consumeCode: vi.fn(), balance: vi.fn(),
    }), register);
    expect((await response.json()).text).not.toBe(HELP);
    expect(register).not.toHaveBeenCalled();
  });
});
