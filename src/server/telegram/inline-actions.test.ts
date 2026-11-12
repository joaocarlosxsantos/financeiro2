import { describe, expect, it } from "vitest";
import { actionForCommand, appDetailsUrl, createActionKeyboard, readActionToken, signActionToken, CALLBACK_TTL_SECONDS } from "./inline-actions";

const now = new Date("2026-11-12T15:00:00Z");
const owner = "owner:2026-11-10T12:00:00.000Z";
const secret = "fake-callback-secret";

describe("ações inline assinadas", () => {
  it("assina payload menor que 64 bytes sem expor chat, dono ou segredo", () => {
    const token = signActionToken("s4", "123", owner, secret, now);
    expect(Buffer.byteLength(token)).toBeLessThanOrEqual(64);
    expect(token).not.toContain(owner);
    expect(token).not.toContain(secret);
    expect(readActionToken(token, "123", owner, secret, now)).toEqual({ action: "s4" });
  });
  it("chat diferente, novo vínculo, segredo diferente e adulteração não autorizam", () => {
    const token = signActionToken("p", "123", owner, secret, now);
    expect(readActionToken(token, "456", owner, secret, now)).toEqual({ error: "invalid" });
    expect(readActionToken(token, "123", owner + "relinked", secret, now)).toEqual({ error: "invalid" });
    expect(readActionToken(token, "123", owner, "other-secret", now)).toEqual({ error: "invalid" });
    expect(readActionToken(token.replace(":p:", ":s0:"), "123", owner, secret, now)).toEqual({ error: "invalid" });
  });
  it("expira no limite, rejeita lixo/injeção/ações desconhecidas e falha sem segredo", () => {
    const token = signActionToken("p", "123", owner, secret, now);
    expect(readActionToken(token, "123", owner, secret, new Date(now.getTime() + CALLBACK_TTL_SECONDS * 1000))).toEqual({ error: "expired" });
    for (const data of ["", "x".repeat(65), "v1:delete_user:1:xxx:xxx", "';drop table users;--", token + "x"])
      expect(readActionToken(data, "123", owner, secret, now)).toEqual({ error: "invalid" });
    expect(readActionToken(token, "123", owner, undefined, now)).toEqual({ error: "invalid" });
  });
  it("monta botões curtos com ações permitidas, sem inventar preferências", () => {
    const keyboard = createActionKeyboard("/cartao", "123", owner, secret, now);
    expect(keyboard.inline_keyboard.flat().map(b => b.text)).toEqual(["Ver detalhes", "Pausar avisos", "Silenciar tipo"]);
    const actions = keyboard.inline_keyboard.flat().map(b => readActionToken(b.callback_data, "123", owner, secret, now));
    expect(actions).toEqual([{ action: "d1" }, { action: "p" }, { action: "s4" }]);
    expect(createActionKeyboard("/assinaturas", "123", owner, secret, now).inline_keyboard.flat()).toHaveLength(2);
    expect(actionForCommand("/ajuda")).toBeNull();
    expect(actionForCommand("/SALDO@mutano_bot")).not.toBeNull();
  });
  it("links de detalhes só usam caminhos fixos e nunca credenciais ou URL do callback", () => {
    expect(appDetailsUrl("d1", "https://app.test/base?secret=value")).toBe("https://app.test/contas");
    expect(appDetailsUrl("d0", "javascript:alert(1)")).toBe("https://mutanocontas.vercel.app/contas");
    expect(appDetailsUrl("d0", "https://name:secret@app.test")).toBe("https://mutanocontas.vercel.app/contas");
  });
});
