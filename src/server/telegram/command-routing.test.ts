import { describe, expect, it, vi } from "vitest";
import { commandReply, HELP, isFinancialCommand, isFreeQuestion, newLinkCode, type CommandDependencies, type TelegramMessage } from "./protocol";
import { BOT_COMMANDS } from "./commands";

const message = (text: string): TelegramMessage => ({ text, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } });
function deps(): CommandDependencies {
  return { consumeCode: vi.fn().mockResolvedValue(true), linkedUser: vi.fn().mockResolvedValue("owner"),
    balance: vi.fn().mockResolvedValue({ availableCents: 12345, investedCents: 20000, netWorthCents: 31000, totalIncomplete: false, needsOpeningBalance: false }) };
}

describe("boas-vindas e roteamento autorizado", () => {
  it.each(["oi", "Olá!", "ola", "OLÁ", "start", "menu", "ajuda", "bom dia", "/start", "/menu", "/ajuda", "/desconhecido", "xyz 123", "qual é a capital da França?"])("%s mostra comandos sem usar IA ou consultar saldo", async text => {
    const d = deps();
    expect(isFreeQuestion(text)).toBe(false);
    expect(isFinancialCommand(text)).toBe(false);
    expect(await commandReply(message(text), d)).toBe(HELP);
    expect(d.linkedUser).toHaveBeenCalledWith("123");
    expect(d.balance).not.toHaveBeenCalled();
    expect(d.consumeCode).not.toHaveBeenCalled();
  });
  it.each(["oi", "/ajuda", "/menu", "/start", "/desconhecido", "xyz"])("%s não revela boas-vindas/menu a chat sem vínculo", async text => {
    const d = deps(); vi.mocked(d.linkedUser).mockResolvedValue(null);
    const reply = await commandReply(message(text), d);
    expect(reply).not.toBe(HELP);
    expect(reply).toContain("Configurações");
    expect(reply).not.toContain("/saldo");
    expect(d.balance).not.toHaveBeenCalled();
  });
  it.each(["qual é meu saldo?", "quanto gastei?", "compare novembro e outubro", "minhas maiores despesas", "contas a vencer", "quanto tenho investido?", "gastos por categoria", "como economizar?", "qual foi a maior compra?", "quanto entrou este mês?", "quanto tenho?"])("preserva pergunta financeira reconhecida: %s", text => {
    expect(isFreeQuestion(text)).toBe(true);
  });
  it("registra todos os comandos reais em texto puro, um por linha, sem inventar ferramentas como comandos", async () => {
    const expected = ["saldo", "cartao", "previsao", "hoje", "assinaturas", "resumo", "relatorio", "start", "menu", "ajuda", "pausar"];
    expect(BOT_COMMANDS.map(c => c.command).sort()).toEqual(expected.sort());
    const listed = HELP.split("\n").filter(line => line.startsWith("/")).map(line => line.split(" ")[0].slice(1));
    expect(listed.sort()).toEqual(expected.sort());
    expect(HELP).not.toMatch(/\\_|get_balance|\/investimentos|\/lancar|\/contas/);
    expect(HELP.length).toBeLessThan(4096);
    const d = deps();
    for (const { command } of BOT_COMMANDS) {
      const reply = await commandReply(message(`/${command}`), d);
      if (!["start", "menu", "ajuda"].includes(command)) expect(reply).not.toBe(HELP);
    }
  });
  it("/start válido mantém o código case-sensitive e só então mostra boas-vindas", async () => {
    const d = deps(); const code = newLinkCode();
    expect(await commandReply(message(`/start ${code.code}`), d)).toContain(HELP);
    expect(d.consumeCode).toHaveBeenCalledWith(code.codeHash, "123");
    vi.mocked(d.consumeCode).mockResolvedValue(false);
    expect(await commandReply(message(`/start ${code.code}`), d)).not.toContain(HELP);
  });
  it("comandos com sufixo do bot e capitalização continuam com a mesma autorização", async () => {
    expect(isFinancialCommand("/SALDO@mutano_bot")).toBe(true);
    const d = deps();
    expect(await commandReply(message("/SALDO@mutano_bot"), d)).toContain("123,45");
    expect(d.balance).toHaveBeenCalledWith("owner");
    expect(isFinancialCommand("/saldo outro_usuario")).toBe(false);
  });
  it("/saldo separa disponível, investido e patrimônio, sem recalcular ou somar valores", async () => {
    const reply = await commandReply(message("/saldo"), deps());
    expect(reply).toMatch(/Disponível:.*123,45\nInvestido:.*200,00\nPatrimônio:.*310,00/);
  });
  it("/saldo aceita o contrato antigo com investimento/patrimônio ausentes como zero", async () => {
    const d = deps();
    vi.mocked(d.balance).mockResolvedValue({ availableCents: 12345, totalIncomplete: true, needsOpeningBalance: true });
    const reply = await commandReply(message("/saldo"), d);
    expect(reply).toMatch(/Investido:.*0,00\nPatrimônio:.*0,00/);
    expect(reply).toContain("Total parcial");
    expect(reply).toContain("saldos iniciais");
  });
});
