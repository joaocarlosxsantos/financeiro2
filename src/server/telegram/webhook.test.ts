import { describe, expect, it, vi } from "vitest";
import { handleWebhook } from "./webhook";
import { MAX_BODY_BYTES } from "./protocol";

const payload = { update_id: 1, message: { chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false }, text: "/saldo" } };
const request = (body: unknown = payload, secret = "secret") => new Request("https://app.test/api/telegram/webhook", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(body),
});

describe("webhook Telegram", () => {
  it("rejeita falta de segredo de configuração e segredo inválido antes de processar", async () => {
    const process = vi.fn();
    expect((await handleWebhook(request(), undefined, process)).status).toBe(503);
    expect((await handleWebhook(request(payload, "wrong"), "secret", process)).status).toBe(401);
    expect(process).not.toHaveBeenCalled();
  });
  it("responde pelo webhook sem parse_mode ou dados no resultado HTTP de erro", async () => {
    const process = vi.fn().mockResolvedValue("Saldo: R$ 10,00");
    const result = await handleWebhook(request(), "secret", process);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ method: "sendMessage", chat_id: 123, text: "Saldo: R$ 10,00", protect_content: true });
    expect(process).toHaveBeenCalledWith(1, payload.message);
  });
  it.each([
    { ...payload, message: { ...payload.message, chat: { id: -123, type: "group" } } },
    { ...payload, message: { ...payload.message, text: "x".repeat(513) } },
    { update_id: 2, edited_message: payload.message },
    { update_id: 3 },
  ])("ignora update não suportado", async (body) => {
    const process = vi.fn();
    expect((await handleWebhook(request(body), "secret", process)).status).toBe(200);
    expect(process).not.toHaveBeenCalled();
  });
  it("rejeita stream grande mesmo sem Content-Length e JSON inválido", async () => {
    const process = vi.fn();
    expect((await handleWebhook(request("x".repeat(MAX_BODY_BYTES)), "secret", process)).status).toBe(413);
    const invalid = new Request("https://app.test", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "secret" }, body: "{" });
    expect((await handleWebhook(invalid, "secret", process)).status).toBe(400);
    expect(process).not.toHaveBeenCalled();
  });
  it("deduplicação/limite retorna apenas ok", async () => {
    expect(await (await handleWebhook(request(), "secret", vi.fn().mockResolvedValue(null))).json()).toEqual({ ok: true });
  });
  it.each(["/resumo", "/saldo", "/ajuda"])("falha interna em %s responde no chat com log seguro sem dados sensíveis", async (text) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("token balance chat_id user_id"), { code: "22003" });
    const body = { ...payload, message: { ...payload.message, text } };
    const result = await handleWebhook(request(body), "secret", vi.fn().mockRejectedValue(error));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    const reply = await result.json();
    expect(reply).toEqual({
      method: "sendMessage", chat_id: 123,
      text: "Não foi possível consultar seus dados agora. Tente novamente em instantes.",
      protect_content: true,
    });
    expect(reply.text.length).toBeLessThanOrEqual(4096);
    expect(reply).not.toHaveProperty("parse_mode");
    expect(log).toHaveBeenCalledWith("[telegram-webhook]", { name: "Error", code: "22003" });
    const loggedStr = JSON.stringify(log.mock.calls);
    expect(loggedStr).not.toContain("token");
    expect(loggedStr).not.toContain("balance");
    expect(loggedStr).not.toContain("chat_id");
    expect(loggedStr).not.toContain("user_id");
    log.mockRestore();
  });
  it("resumo no limite do formatador é devolvido integralmente sem parse_mode", async () => {
    const text = "*Resumo* _com caracteres especiais_\n".padEnd(3800, "x");
    const result = await handleWebhook(request({ ...payload, message: { ...payload.message, text: "/resumo" } }), "secret", vi.fn().mockResolvedValue(text));
    const reply = await result.json();
    expect(reply.text).toBe(text);
    expect(reply.text.length).toBeLessThanOrEqual(4096);
    expect(reply).not.toHaveProperty("parse_mode");
  });
});
