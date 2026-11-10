import { describe, expect, it, vi } from "vitest";
import { commandReply, type CommandDependencies, type TelegramMessage } from "./protocol";
import { handleInsightsCron, type CronDependencies } from "./cron";
import { DEFAULT_PREFERENCES } from "./insights";

const message = (text: string): TelegramMessage => ({ text, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } });

describe("/relatorio", () => {
  it("usa apenas o dono do vínculo e rejeita argumentos", async () => {
    const report = vi.fn().mockResolvedValue("Relatório mensal");
    const deps: CommandDependencies & { report: typeof report } = {
      consumeCode: vi.fn(), linkedUser: vi.fn().mockResolvedValue("linked-owner"), balance: vi.fn(), report,
    };
    expect(await commandReply(message("/relatorio"), deps)).toBe("Relatório mensal");
    expect(report).toHaveBeenCalledWith("linked-owner");
    await commandReply(message("/relatorio user_id=other"), deps);
    vi.mocked(deps.linkedUser).mockResolvedValue(null);
    expect(await commandReply(message("/relatorio"), deps)).toContain("Vincule");
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe("cron mensal", () => {
  it("usa a janela escolhida, respeita resumo e reserva antes de enviar", async () => {
    const window = { key: "2026-12:month", day: "2027-01-01", hour: 8 as const, monthly: true as const };
    const claims = new Set<string>();
    const renderMessage = vi.fn().mockResolvedValue("Fechamento de dezembro");
    const send = vi.fn().mockResolvedValue(undefined);
    const deps: CronDependencies & { renderMessage: typeof renderMessage } = {
      candidates: async () => [
        { userId: "on", chatId: "100", prefs: { ...DEFAULT_PREFERENCES, enabled: true } },
        { userId: "off", chatId: "200", prefs: { ...DEFAULT_PREFERENCES, enabled: true, summary: false } },
      ],
      data: vi.fn(), renderMessage, send, finish: vi.fn(), stillEnabled: async () => true,
      claim: async (userId, key) => {
        const id = `${userId}:${key}`;
        if (claims.has(id)) return false;
        claims.add(id);
        return true;
      },
    };
    const request = new Request("https://app.test/api/cron/insights/monthly?user_id=other", { headers: { authorization: "Bearer test-secret" } });
    const run = (secret: string) => handleInsightsCron(request, secret, deps, new Date("2027-01-01T11:00:00Z"), () => window);
    expect((await run("wrong")).status).toBe(401);
    await Promise.all([run("test-secret"), run("test-secret")]);
    expect(send.mock.calls).toEqual([["100", "Fechamento de dezembro"]]);
    expect([...claims]).toEqual(["on:2026-12:month"]);
    expect(deps.data).not.toHaveBeenCalled();
  });
});
