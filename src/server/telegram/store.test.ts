import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  events: [] as { kind: string; value: unknown }[],
  transaction: vi.fn(),
  balance: vi.fn(),
  summary: vi.fn(),
  forecast: vi.fn(),
  dailyBudget: vi.fn(),
  subscriptions: vi.fn(),
  cards: vi.fn(),
  ai: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: (...args: unknown[]) => mocks.transaction(...args) } }));
vi.mock("@/server/queries", () => ({ getBalances: (...args: unknown[]) => mocks.balance(...args) }));
vi.mock("./insight-store", () => ({
  manualSummary: (...args: unknown[]) => mocks.summary(...args),
  manualForecast: (...args: unknown[]) => mocks.forecast(...args),
  manualDailyBudget: (...args: unknown[]) => mocks.dailyBudget(...args),
  manualSubscriptionsInsight: (...args: unknown[]) => mocks.subscriptions(...args),
}));
vi.mock("./card-summary", () => ({
  loadCardSummary: (...args: unknown[]) => mocks.cards(...args),
}));
vi.mock("./daily-summary", () => ({
  renderDailySummary: (...args: unknown[]) => mocks.summary(...args),
}));
vi.mock("./ai-service", () => ({ answerQuestion: (...args: unknown[]) => mocks.ai(...args) }));

import { disconnect, issueLink, processMessage } from "./store";
import { telegramLinkCodes, telegramLinks, telegramPreferences, users } from "@/db/schema";
import { hashCode, newLinkCode, type TelegramMessage } from "./protocol";

const message = (text: string): TelegramMessage => ({ text, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } });
const sqlQuery = (value: unknown) => new PgDialect().sqlToQuery(value as SQL);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.results.length = mocks.events.length = 0;
  const query = (kind: string, table?: unknown) => {
    mocks.events.push({ kind, value: table });
    const result = () => Promise.resolve(mocks.results.shift() ?? []);
    const chain = {
      from: (value: unknown) => { mocks.events.push({ kind: "from", value }); return chain; },
      values: (value: unknown) => { mocks.events.push({ kind: "values", value }); return chain; },
      where: (value: unknown) => { mocks.events.push({ kind: "where", value }); return chain; },
      for: (value: unknown) => { mocks.events.push({ kind: "lock", value }); return chain; },
      onConflictDoUpdate: (value: unknown) => { mocks.events.push({ kind: "upsert", value }); return chain; },
      onConflictDoNothing: () => { mocks.events.push({ kind: "ignoreConflict", value: null }); return chain; },
      returning: result,
      limit: result,
      then: (resolve: (value: unknown[][][number]) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
    };
    return chain;
  };
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    insert: (table: unknown) => query("insert", table),
    delete: (table: unknown) => query("delete", table),
    select: () => query("select"),
  }));
});

describe("persistência Telegram", () => {
  it("esquema impede chat e usuário em múltiplos vínculos e remove vínculo ao excluir dono", () => {
    const config = getTableConfig(telegramLinks);
    expect(telegramLinks.userId.primary).toBe(true);
    expect(telegramLinks.chatId.isUnique).toBe(true);
    expect(config.foreignKeys[0].reference().foreignTable).toBe(users);
    expect(config.foreignKeys[0].onDelete).toBe("cascade");
    expect(telegramLinkCodes.codeHash.isUnique).toBe(true);
  });
  it("emite somente hash, substitui código anterior do dono e serializa com desconexão", async () => {
    const result = await issueLink("session-owner");
    expect(mocks.events.find((e) => e.kind === "lock")?.value).toBe("update");
    const write = mocks.events.find((e) => e.kind === "values")?.value as Record<string, unknown>;
    expect(write).toEqual({ userId: "session-owner", codeHash: hashCode(result.code), expiresAt: result.expiresAt });
    expect(JSON.stringify(write)).not.toContain(result.code);
    const upsert = mocks.events.find((e) => e.kind === "upsert")?.value as { target: unknown };
    expect(upsert.target).toBe(telegramLinkCodes.userId);
  });
  it("desconecta e invalida código somente do dono recebido da sessão", async () => {
    await disconnect("session-owner");
    expect(mocks.events.filter((e) => e.kind === "delete").map((e) => e.value)).toEqual([telegramLinkCodes, telegramLinks]);
    for (const event of mocks.events.filter((e) => e.kind === "where")) {
      expect(sqlQuery(event.value).params).toEqual(["session-owner"]);
    }
  });
  it.each([{ rows: [] }, { rows: [{ count: 11 }] }])("não executa comando em replay ou limite excedido", async ({ rows }) => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.results.push(rows);
    expect(await processMessage(10, message("/saldo"))).toBeNull();
    expect(mocks.balance).not.toHaveBeenCalled();
    expect(mocks.events.filter((e) => e.kind === "select")).toHaveLength(0);
    const upsert = mocks.events.find((e) => e.kind === "upsert")?.value as { setWhere: SQL; set: { requestCount: SQL } };
    expect(sqlQuery(upsert.setWhere).sql).toContain('"telegram_chat_state"."last_update_id" <');
    expect(sqlQuery(upsert.set.requestCount).sql).toContain("least(");
    expect(log).toHaveBeenCalledExactlyOnceWith("[telegram-webhook]", {
      event: "update_ignored", reason: rows.length ? "rate_limit" : "deduplication", count: 1,
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("chatId");
    expect(logged).not.toContain("updateId");
    expect(logged).not.toContain("/saldo");
    log.mockRestore();
  });
  it("consulta saldo usando vínculo filtrado por chat", async () => {
    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    mocks.balance.mockResolvedValue({ availableCents: 100, totalIncomplete: false });
    expect(await processMessage(11, message("/saldo"))).toContain("1,00");
    expect(mocks.balance).toHaveBeenCalledWith("linked-owner", expect.objectContaining({ select: expect.any(Function) }));
    expect(sqlQuery(mocks.events.find((e) => e.kind === "where")?.value).params).toEqual(["123"]);
  });
  it("processa /resumo chamando renderDailySummary com vínculo filtrado por chat", async () => {
    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    mocks.summary.mockResolvedValue("CONTA\nSaldo total: R$ 500,00");
    const reply = await processMessage(12, message("/resumo"));
    expect(reply).toBe("CONTA\nSaldo total: R$ 500,00");
    expect(mocks.summary).toHaveBeenCalledWith("linked-owner", expect.objectContaining({ select: expect.any(Function) }));
  });
  it("consome por DELETE RETURNING com validade e nunca sobrescreve vínculo existente", async () => {
    const token = newLinkCode();
    mocks.results.push([{ count: 1 }], [{ userId: "code-owner" }], []);
    expect(await processMessage(12, message(`/start ${token.code}`))).toContain("já vinculada");
    const predicate = sqlQuery(mocks.events.find((e) => e.kind === "where")?.value);
    expect(predicate.sql).toContain('"telegram_link_codes"."expires_at" >');
    expect(predicate.sql).toContain("clock_timestamp()");
    expect(predicate.params[0]).toBe(token.codeHash);
    expect(mocks.events.filter((e) => e.kind === "ignoreConflict")).toHaveLength(1);
    expect(mocks.events.filter((e) => e.kind === "upsert")).toHaveLength(1); // somente estado do chat
  });
  it("código inexistente/expirado/consumido não grava vínculo", async () => {
    mocks.results.push([{ count: 1 }], []);
    expect(await processMessage(13, message(`/start ${newLinkCode().code}`))).toContain("expirado");
    expect(mocks.events.filter((e) => e.kind === "insert").map((e) => e.value)).not.toContain(telegramLinks);
  });
  it("/pausar persiste opt-out somente no dono vinculado", async () => {
    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    expect(await processMessage(14, message("/pausar"))).toContain("pausados");
    expect(mocks.events.find((e) => e.kind === "insert" && e.value === telegramPreferences)).toBeTruthy();
    expect(mocks.events.filter((e) => e.kind === "values").at(-1)?.value).toEqual({ userId: "linked-owner", enabled: false });
    expect(mocks.balance).not.toHaveBeenCalled();
  });
  it("/resumo mantém leituras na conexão da transação", async () => {
    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    mocks.summary.mockResolvedValue("Resumo solicitado");
    expect(await processMessage(15, message("/resumo"))).toBe("Resumo solicitado");
    expect(mocks.summary).toHaveBeenCalledWith("linked-owner", expect.objectContaining({ select: expect.any(Function) }));
  });
  it("pergunta livre só chega à IA com identidade do vínculo e após liberar a transação", async () => {
    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    let committed = false;
    const callback = mocks.transaction.getMockImplementation()!;
    mocks.transaction.mockImplementation(async (...args: unknown[]) => {
      const value = await callback(...args); committed = true; return value;
    });
    mocks.ai.mockImplementation(async () => { expect(committed).toBe(true); return "Resposta IA"; });
    expect(await processMessage(16, message("user_id=attacker quanto gastei?"))).toBe("Resposta IA");
    expect(mocks.ai).toHaveBeenCalledWith("linked-owner", "123", "user_id=attacker quanto gastei?");
  });
  it("chat sem vínculo, comando desconhecido e replay não chamam IA", async () => {
    mocks.results.push([{ count: 1 }], []);
    expect(await processMessage(17, message("saldo?"))).toContain("Vincule");
    mocks.results.push([{ count: 1 }]);
    await processMessage(18, message("/desconhecido"));
    mocks.results.push([]);
    await processMessage(18, message("saldo?"));
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("regressão: upsert de estado serializa timestamps como strings ISO para evitar erro Date no postgres.js", async () => {
    mocks.results.push([{ count: 1 }]);
    await processMessage(19, message("/ajuda"));
    const upsert = mocks.events.find((e) => e.kind === "upsert")?.value as {
      setWhere: SQL;
      set: { windowStartedAt: SQL; requestCount: SQL };
    };
    const setWhereQuery = sqlQuery(upsert.setWhere);
    const setWindowQuery = sqlQuery(upsert.set.windowStartedAt);
    expect(setWhereQuery.params.some((p) => p instanceof Date)).toBe(false);
    expect(setWindowQuery.params.some((p) => p instanceof Date)).toBe(false);
    expect(setWhereQuery.sql).toContain("::timestamptz");
    expect(setWindowQuery.sql).toContain("::timestamptz");
  });
  it("/previsao e /hoje mantêm leituras na conexão da transação", async () => {
    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    mocks.forecast.mockResolvedValue("Previsão mock");
    expect(await processMessage(20, message("/previsao"))).toBe("Previsão mock");
    expect(mocks.forecast).toHaveBeenCalledWith("linked-owner", expect.objectContaining({ select: expect.any(Function) }));

    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    mocks.dailyBudget.mockResolvedValue("Hoje mock");
    expect(await processMessage(21, message("/hoje"))).toBe("Hoje mock");
    expect(mocks.dailyBudget).toHaveBeenCalledWith("linked-owner", expect.objectContaining({ select: expect.any(Function) }));

    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    mocks.subscriptions.mockResolvedValue("Assinaturas mock");
    expect(await processMessage(22, message("/assinaturas"))).toBe("Assinaturas mock");
    expect(mocks.subscriptions).toHaveBeenCalledWith("linked-owner", expect.objectContaining({ select: expect.any(Function) }));

    mocks.results.push([{ count: 1 }], [{ userId: "linked-owner" }]);
    mocks.cards.mockResolvedValue("Cartões mock");
    expect(await processMessage(23, message("/cartao"))).toBe("Cartões mock");
    expect(mocks.cards).toHaveBeenCalledWith("linked-owner", expect.objectContaining({ select: expect.any(Function) }), expect.any(Date));
  });
});
