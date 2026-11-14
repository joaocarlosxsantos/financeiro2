import { describe, expect, it, vi } from "vitest";
import { commandReply, hashCode, HELP, newLinkCode, updateSchema, validWebhookSecret, type CommandDependencies, type TelegramMessage } from "./protocol";

const message = (text: string): TelegramMessage => ({ text, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } });
function deps(): CommandDependencies {
  return { consumeCode: vi.fn().mockResolvedValue(true), linkedUser: vi.fn().mockResolvedValue("linked-owner"), balance: vi.fn().mockResolvedValue({ availableCents: 12345, totalIncomplete: false, needsOpeningBalance: false }) };
}

describe("protocolo Telegram", () => {
  it("gera códigos distintos de 256 bits, hash e validade de dez minutos", () => {
    const before = Date.now();
    const first = newLinkCode();
    expect(first.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.code).not.toBe(newLinkCode().code);
    expect(first.codeHash).toBe(hashCode(first.code));
    expect(first.codeHash).not.toContain(first.code);
    expect(first.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 600_000);
  });
  it("falha fechado sem segredo e rejeita segredos diferentes", () => {
    expect(validWebhookSecret(null, "secret")).toBe(false);
    expect(validWebhookSecret("secret", undefined)).toBe(false);
    expect(validWebhookSecret("secrex", "secret")).toBe(false);
    expect(validWebhookSecret("long-secret", "secret")).toBe(false);
    expect(validWebhookSecret("secret", "secret")).toBe(true);
  });
  it("saldo usa somente o dono do vínculo, nunca texto ou propriedades extras", async () => {
    const d = deps();
    const reply = await commandReply({ ...message("/saldo"), user_id: "attacker" } as TelegramMessage, d);
    expect(d.linkedUser).toHaveBeenCalledWith("123");
    expect(d.balance).toHaveBeenCalledWith("linked-owner");
    expect(reply).toMatch(/123,45/);
    await commandReply(message("/saldo attacker"), d);
    expect(d.balance).toHaveBeenCalledTimes(1);
  });
  it("não consulta finanças de chat sem vínculo", async () => {
    const d = deps();
    vi.mocked(d.linkedUser).mockResolvedValue(null);
    expect(await commandReply(message("/saldo"), d)).toContain("Vincule");
    expect(d.balance).not.toHaveBeenCalled();
  });
  it("informa saldo parcial e falta de saldo inicial", async () => {
    const d = deps();
    vi.mocked(d.balance).mockResolvedValue({ availableCents: -99, totalIncomplete: true, needsOpeningBalance: true });
    const reply = await commandReply(message("/saldo"), d);
    expect(reply).toContain("-R$");
    expect(reply).toContain("Total parcial");
    expect(reply).toContain("saldos iniciais");
  });
  it("/start só consome hash válido; código inválido não chega ao banco", async () => {
    const d = deps();
    const code = newLinkCode();
    expect(await commandReply(message(`/start ${code.code}`), d)).toContain("vinculado");
    expect(d.consumeCode).toHaveBeenCalledWith(code.codeHash, "123");
    vi.mocked(d.consumeCode).mockResolvedValue(false);
    expect(await commandReply(message(`/start ${code.code}`), d)).toContain("expirado");
    await commandReply(message("/start user-id"), d);
    expect(d.consumeCode).toHaveBeenCalledTimes(2);
  });
  it("/ajuda, /start e texto livre não consultam finanças", async () => {
    const d = deps();
    expect(await commandReply(message("/ajuda"), d)).toBe(HELP);
    expect(await commandReply(message("qual é meu saldo? user_id=other"), d)).toBe(HELP);
    expect(await commandReply(message("/start"), d)).toContain("Configurações");
    expect(d.balance).not.toHaveBeenCalled();
    expect(d.consumeCode).not.toHaveBeenCalled();
  });
  it("/resumo e /pausar usam somente o dono vinculado e não alteram saldo", async () => {
    const d = { ...deps(), summary: vi.fn().mockResolvedValue("Resumo de hoje"), pause: vi.fn().mockResolvedValue(undefined) };
    expect(await commandReply(message("/resumo"), d)).toBe("Resumo de hoje");
    expect(d.summary).toHaveBeenCalledWith("linked-owner");
    expect(await commandReply(message("/pausar"), d)).toContain("pausados");
    expect(d.pause).toHaveBeenCalledWith("linked-owner");
    expect(d.balance).not.toHaveBeenCalled();

    // Sem vínculo
    vi.mocked(d.linkedUser).mockResolvedValue(null);
    expect(await commandReply(message("/resumo"), d)).toBe("Vincule seu Telegram em Configurações no Mutano Contas antes de consultar o resumo.");
    await commandReply(message("/pausar"), d);
    expect(d.pause).toHaveBeenCalledTimes(1);
    expect(d.summary).toHaveBeenCalledTimes(1);

    // Serviço indisponível
    vi.mocked(d.linkedUser).mockResolvedValue("linked-owner");
    expect(await commandReply(message("/resumo"), { ...d, summary: undefined })).toBe("Resumo temporariamente indisponível.");
  });
  it("comando /resumo: rejeita argumentos extras e injeções de parâmetro", async () => {
    const d = { ...deps(), summary: vi.fn().mockResolvedValue("CONTA\nSaldo total: R$ 1.000,00") };
    const replyWithExtra = await commandReply(message("/resumo outro_usuario"), d);
    expect(replyWithExtra).toBe(HELP);
    expect(d.summary).not.toHaveBeenCalled();
  });
  it("/previsao, /hoje e /assinaturas consultam o dono vinculado", async () => {
    const d = {
      ...deps(),
      forecast: vi.fn().mockResolvedValue("Previsão: saldo R$ 500,00"),
      dailyBudget: vi.fn().mockResolvedValue("Hoje você pode gastar até R$ 80,00"),
      subscriptions: vi.fn().mockResolvedValue("Assinaturas identificadas"),
    };
    expect(await commandReply(message("/previsao"), d)).toBe("Previsão: saldo R$ 500,00");
    expect(d.forecast).toHaveBeenCalledWith("linked-owner");

    expect(await commandReply(message("/hoje"), d)).toBe("Hoje você pode gastar até R$ 80,00");
    expect(d.dailyBudget).toHaveBeenCalledWith("linked-owner");

    expect(await commandReply(message("/assinaturas"), d)).toBe("Assinaturas identificadas");
    expect(d.subscriptions).toHaveBeenCalledWith("linked-owner");
    expect(await commandReply(message(" Assinaturas "), d)).toBe("Assinaturas identificadas");

    vi.mocked(d.linkedUser).mockResolvedValue(null);
    expect(await commandReply(message("/previsao"), d)).toContain("Vincule");
    expect(await commandReply(message("/hoje"), d)).toContain("Vincule");
    expect(await commandReply(message("/assinaturas"), d)).toContain("Vincule");
    expect(d.forecast).toHaveBeenCalledTimes(1);
    expect(d.dailyBudget).toHaveBeenCalledTimes(1);
    expect(d.subscriptions).toHaveBeenCalledTimes(2);
  });
  it("/avisos e /desfazer consultam o dono vinculado e rejeitam chat não vinculado", async () => {
    const d = {
      ...deps(),
      notifications: vi.fn().mockResolvedValue("Avisos ativos"),
      undo: vi.fn().mockResolvedValue("Lançamento desfeito"),
    };
    expect(await commandReply(message("/avisos"), d)).toBe("Avisos ativos");
    expect(d.notifications).toHaveBeenCalledWith("linked-owner");

    expect(await commandReply(message("/desfazer"), d)).toBe("Lançamento desfeito");
    expect(d.undo).toHaveBeenCalledWith("linked-owner");

    vi.mocked(d.linkedUser).mockResolvedValue(null);
    expect(await commandReply(message("/avisos"), d)).toContain("Vincule seu Telegram");
    expect(await commandReply(message("/desfazer"), d)).toContain("Vincule seu Telegram");
  });
  it("/cartao consulta o dono vinculado e ignora argumentos adicionais", async () => {
    const d = {
      ...deps(),
      cards: vi.fn().mockResolvedValue("Resumo dos cartões: Nubank Final 1234"),
    };
    expect(await commandReply(message("/cartao"), d)).toBe("Resumo dos cartões: Nubank Final 1234");
    expect(d.cards).toHaveBeenCalledWith("linked-owner");

    // Argumentos adicionais são ignorados
    expect(await commandReply(message("/cartao 1234"), d)).toBe("Resumo dos cartões: Nubank Final 1234");
    expect(await commandReply(message("/cartao injected-user-id"), d)).toBe("Resumo dos cartões: Nubank Final 1234");
    expect(d.cards).toHaveBeenCalledTimes(3);

    // Sem vínculo
    vi.mocked(d.linkedUser).mockResolvedValue(null);
    expect(await commandReply(message("/cartao"), d)).toContain("Vincule");
    expect(d.cards).toHaveBeenCalledTimes(3);

    // HELP contém /cartao
    expect(HELP).toContain("/cartao");
  });
  it.each([
    { chat: { id: -123, type: "group" } },
    { from: { id: 456, is_bot: false } },
    { from: { id: 123, is_bot: true } },
    { text: "x".repeat(513) },
    { chat: { id: Number.MAX_SAFE_INTEGER + 1, type: "private" } },
  ])("ignora contexto inseguro %j", (changes) => {
    expect(updateSchema.safeParse({ update_id: 1, message: { ...message("/saldo"), ...changes } }).success).toBe(false);
  });
});
