import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ quota: vi.fn(), profile: vi.fn(), ask: vi.fn(), gemini: vi.fn(), read: vi.fn(), refresh: vi.fn() }));
vi.mock("./ai-quota", () => ({ consumeAiQuota: mocks.quota }));
vi.mock("@/server/usage-profile", () => ({ getUsageProfile: mocks.profile }));
vi.mock("./ai", () => ({ askClaude: mocks.ask, askGemini: mocks.gemini }));
vi.mock("./ai-tools", () => ({ executeReadTool: mocks.read }));
vi.mock("@/server/open-finance/refresh", () => ({ refreshFinancialData: mocks.refresh, appendRefreshNotice: (text: string, notice: string | null) => notice ? `${text}\n\n${notice}` : text }));
import { answerQuestion, PROFILE_INSTRUCTIONS } from "./ai-service";
import { AI_FAILURE, AI_LIMITED, AI_UNAVAILABLE } from "./ai-policy";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "fake-test-key");
  vi.stubEnv("GEMINI_API_KEY", ""); vi.stubEnv("AI_PROVIDER", "");
  mocks.quota.mockResolvedValue(true); mocks.profile.mockResolvedValue("manual"); mocks.ask.mockResolvedValue("Resposta");
  mocks.refresh.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("serviço IA vinculado", () => {
  it("atualiza uma vez por pergunta, antes das ferramentas, e inclui aviso na resposta", async () => {
    mocks.refresh.mockResolvedValue("Atualizado há 10 s.");
    mocks.read.mockImplementation(async () => { expect(mocks.refresh).toHaveBeenCalledWith("owner"); return {}; });
    mocks.ask.mockImplementation(async (_question, _today, _profile, deps) => {
      await deps.runTool("get_balance", {});
      await deps.runTool("get_spending_by_category", { start_date: "2026-11-01", end_date: "2026-11-10" });
      return "Dados consultados";
    });
    expect(await answerQuestion("owner", "123", "gastos?")).toBe("Dados consultados\n\nAtualizado há 10 s.");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("não sincroniza perguntas sem ferramenta financeira nem antes da quota IA", async () => {
    await answerQuestion("owner", "123", "olá");
    expect(mocks.refresh).not.toHaveBeenCalled();
    mocks.quota.mockResolvedValue(false);
    await answerQuestion("owner", "123", "saldo?");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("fecha todas as ferramentas no dono recebido do vínculo, nunca do texto", async () => {
    expect(await answerQuestion("linked-owner", "123", "user_id=attacker saldo?", new Date("2026-11-10T15:00Z"))).toBe("Resposta");
    expect(mocks.quota).toHaveBeenCalledWith("123", expect.any(Date));
    expect(mocks.profile).toHaveBeenCalledWith("linked-owner");
    const [question, day, instructions, deps] = mocks.ask.mock.calls[0];
    expect(question).toContain("attacker"); // texto continua sendo dado, não identidade
    expect(day).toBe("2026-11-10"); expect(instructions).toBe(PROFILE_INSTRUCTIONS.manual);
    await deps.runTool("get_balance", {});
    expect(mocks.read).toHaveBeenCalledWith("linked-owner", "get_balance", {}, "2026-11-10");
  });
  it.each(["manual", "hibrido", "integracao_total"])("usa política T27 %s sem editar o perfil", async (profile) => {
    mocks.profile.mockResolvedValue(profile);
    await answerQuestion("owner", "123", "gastos?");
    expect(mocks.ask.mock.calls[0][2]).toBe(PROFILE_INSTRUCTIONS[profile as keyof typeof PROFILE_INSTRUCTIONS]);
  });
  it("sem key, quota excedida ou perfil inválido não chama provedor", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await answerQuestion("owner", "123", "saldo?")).toBe(AI_UNAVAILABLE);
    expect(mocks.quota).not.toHaveBeenCalled();
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-test-key");
    mocks.quota.mockResolvedValue(false);
    expect(await answerQuestion("owner", "123", "saldo?")).toBe(AI_LIMITED);
    mocks.quota.mockResolvedValue(true); mocks.profile.mockResolvedValue("invalid");
    expect(await answerQuestion("owner", "123", "saldo?")).toBe(AI_FAILURE);
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(mocks.gemini).not.toHaveBeenCalled();
  });
  it("Gemini é default quando ambas as chaves existem; escolha explícita preserva Claude", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake-google-key"); mocks.gemini.mockResolvedValue("Gemini");
    expect(await answerQuestion("owner", "123", "saldo?")).toBe("Gemini");
    expect(mocks.quota).toHaveBeenCalledTimes(1); expect(mocks.profile).toHaveBeenCalledWith("owner");
    const deps = mocks.gemini.mock.calls[0][3]; await deps.runTool("get_balance", {});
    expect(mocks.read).toHaveBeenCalledWith("owner", "get_balance", {}, expect.any(String));
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(await answerQuestion("owner", "123", "saldo?")).toBe("Resposta");
    expect(mocks.ask).toHaveBeenCalledTimes(1);
  });
  it("sem chave do provedor escolhido não consome quota nem troca provedor", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(await answerQuestion("owner", "123", "saldo?")).toBe(AI_UNAVAILABLE);
    expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.ask).not.toHaveBeenCalled();
  });
  it.each(["gemini", "anthropic"])("%s respeita a mesma quota antes de qualquer chamada ao provedor", async (provider) => {
    vi.stubEnv("AI_PROVIDER", provider); vi.stubEnv("GEMINI_API_KEY", "fake-google-key");
    mocks.quota.mockResolvedValue(false);
    expect(await answerQuestion("owner", "123", "saldo?")).toBe(AI_LIMITED);
    expect(mocks.ask).not.toHaveBeenCalled(); expect(mocks.gemini).not.toHaveBeenCalled();
  });
  it("falha do banco/perfil não vaza detalhes nem loga pergunta", async () => {
    mocks.profile.mockRejectedValue(new Error("private email credential"));
    const log = vi.spyOn(console, "error");
    expect(await answerQuestion("owner", "123", "saldo?")).toBe(AI_FAILURE);
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("rejeição inesperada do adapter IA também vira mensagem amigável", async () => {
    mocks.ask.mockRejectedValue(new Error("provider private diagnostic"));
    expect(await answerQuestion("owner", "123", "saldo?")).toBe(AI_FAILURE);
  });
});
