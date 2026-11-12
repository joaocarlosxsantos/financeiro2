import { describe, expect, it, vi } from "vitest";
import { handleWebhook, type InlineDependencies } from "./webhook";
import { sendCallbackDetails } from "./callback-delivery";
import { CALLBACK_TEXT } from "./inline-actions";
import type { TelegramCallback } from "./protocol";

const callback: TelegramCallback = { id: "query-123", from: { id: 123, is_bot: false },
  message: { message_id: 10, date: 1794490000, chat: { id: 123, type: "private" }, from: { id: 999, is_bot: true } }, data: "opaque" };
const payload = { update_id: 30, callback_query: callback };
const request = (body: unknown = payload, secret = "secret") => new Request("https://app.test/api/telegram/webhook", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(body),
});
const deps = (): InlineDependencies => ({ callback: vi.fn().mockResolvedValue({ text: CALLBACK_TEXT.paused }), keyboard: vi.fn(), details: vi.fn() });

describe("webhook de callback", () => {
  it("acknowledges o callback sem acionar mensagens/IA nem parse_mode", async () => {
    const inline = deps(), process = vi.fn();
    const response = await handleWebhook(request(), "secret", process, undefined, inline);
    expect(await response.json()).toEqual({ method: "answerCallbackQuery", callback_query_id: "query-123", text: CALLBACK_TEXT.paused, show_alert: true, cache_time: 0 });
    expect(inline.callback).toHaveBeenCalledWith(30, callback);
    expect(process).not.toHaveBeenCalled(); expect(inline.keyboard).not.toHaveBeenCalled();
  });
  it.each([
    { ...callback, from: { id: 456, is_bot: false } },
    { ...callback, from: { id: 123, is_bot: true } },
    { ...callback, message: { ...callback.message, chat: { id: -123, type: "group" } } },
    { ...callback, message: { ...callback.message, date: 0 } },
    { ...callback, message: undefined, inline_message_id: "inline-id" },
    { ...callback, data: "á".repeat(33) },
    { ...callback, data: "x".repeat(65) },
  ])("rejeita callback fora do contexto privado/autorizável", async bad => {
    const inline = deps();
    expect(await (await handleWebhook(request({ ...payload, callback_query: bad }), "secret", vi.fn(), undefined, inline)).json()).toEqual({ ok: true });
    expect(inline.callback).not.toHaveBeenCalled();
  });
  it("segredo inválido e updates mistos não chamam callbacks", async () => {
    const inline = deps();
    expect((await handleWebhook(request(payload, "wrong"), "secret", vi.fn(), undefined, inline)).status).toBe(401);
    const message = { text: "/saldo", chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } };
    expect(await (await handleWebhook(request({ ...payload, message }), "secret", vi.fn(), undefined, inline)).json()).toEqual({ ok: true });
    expect(inline.callback).not.toHaveBeenCalled();
  });
  it("erro mantém resposta curta sem detalhes privados e sem enfileirar envio", async () => {
    const inline = deps(); vi.mocked(inline.callback).mockRejectedValue(new Error("private-token db-payload"));
    const body = await (await handleWebhook(request(), "secret", vi.fn(), undefined, inline)).json();
    expect(body.text).toBe(CALLBACK_TEXT.failed);
    expect(JSON.stringify(body)).not.toContain("private-token");
    expect(inline.details).not.toHaveBeenCalled();
  });
  it.each([true, false])("detalhes só são enviados após autorização; retorno de envio=%s", async ok => {
    const inline = deps(); vi.mocked(inline.callback).mockResolvedValue({ text: CALLBACK_TEXT.details, details: "d1" });
    vi.mocked(inline.details).mockResolvedValue(ok);
    const body = await (await handleWebhook(request(), "secret", vi.fn(), undefined, inline)).json();
    expect(inline.details).toHaveBeenCalledWith(callback, "d1");
    expect(body.text).toBe(ok ? CALLBACK_TEXT.details : CALLBACK_TEXT.detailsFailed);
  });
  it("reply normal recebe teclado opcional; falha dos botões preserva o texto", async () => {
    const inline = deps();
    const markup = { inline_keyboard: [[{ text: "Pausar avisos", callback_data: "opaque" }]] };
    vi.mocked(inline.keyboard).mockResolvedValue(markup);
    const message = { text: "/saldo", chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } };
    const response = await handleWebhook(request({ update_id: 1, message }), "secret", vi.fn().mockResolvedValue("Saldo"), undefined, inline);
    expect((await response.json()).reply_markup).toEqual(markup);
    vi.mocked(inline.keyboard).mockRejectedValue(new Error("optional-menu-failure"));
    const fallback = await (await handleWebhook(request({ update_id: 2, message }), "secret", vi.fn().mockResolvedValue("Saldo"), undefined, inline)).json();
    expect(fallback.text).toBe("Saldo"); expect(fallback).not.toHaveProperty("reply_markup");
  });
});

describe("entrega de detalhes", () => {
  it("usa somente API fixa, chat validado e link do app sem credenciais ou dados financeiros", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    expect(await sendCallbackDetails(callback, "d1", "fake-test-token", fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("https://api.telegram.org/botfake-test-token/sendMessage", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal), cache: "no-store" }));
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.chat_id).toBe(123);
    expect(body.text).toBe("Veja os detalhes no app.");
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Abrir no app", url: expect.stringMatching(/^https:\/\/[^/]+\/contas$/) });
    expect(body.protect_content).toBe(true); expect(body).not.toHaveProperty("parse_mode");
  });
  it("sem token/falha/timeout não vaza erros nem chama hosts alternativos", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("fake-test-token secret"));
    expect(await sendCallbackDetails(callback, "d0", "", fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await sendCallbackDetails(callback, "d0", "fake-test-token", fetcher)).toBe(false);
  });
});
