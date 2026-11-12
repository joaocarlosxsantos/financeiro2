import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), select: vi.fn(), rows: [] as unknown[][], events: [] as { kind: string; table?: unknown; value?: unknown }[] }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select } }));
import { telegramChatState, telegramPreferences, users } from "@/db/schema";
import { processInlineCallback, replyKeyboard } from "./callback-store";
import { CALLBACK_TEXT, SILENCE_TYPES, signActionToken, type InlineAction } from "./inline-actions";
import type { TelegramCallback, TelegramMessage } from "./protocol";

const now = new Date("2026-11-12T15:00:00Z");
const linked = { userId: "owner", createdAt: new Date("2026-11-10T12:00:00Z") };
const secret = "fake-callback-secret";
function callback(action: InlineAction = "p"): TelegramCallback {
  return { id: "callback-1", from: { id: 123, is_bot: false },
    message: { message_id: 7, date: 1794490000, chat: { id: 123, type: "private" }, from: { id: 999, is_bot: true } },
    data: signActionToken(action, "123", `owner:${linked.createdAt.toISOString()}`, secret, now) };
}
const message: TelegramMessage = { text: "/saldo", from: { id: 123, is_bot: false }, chat: { id: 123, type: "private" } };
function authorized(count = 1, live = [linked]) { mocks.rows.push([linked], [{ count }], [{ id: "owner" }], live); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.rows.length = 0; mocks.events.length = 0;
  function query(kind: string, table?: unknown) {
    mocks.events.push({ kind, table });
    const result = () => Promise.resolve(mocks.rows.shift() ?? []);
    const chain = {
      from: (table: unknown) => { mocks.events.push({ kind: "from", table }); return chain; },
      where: (value: unknown) => { mocks.events.push({ kind: "where", value }); return chain; },
      orderBy: () => chain,
      for: (value: unknown) => { mocks.events.push({ kind: "lock", value }); return chain; },
      values: (value: unknown) => { mocks.events.push({ kind: "values", table, value }); return chain; },
      onConflictDoUpdate: (value: unknown) => { mocks.events.push({ kind: "upsert", table, value }); return chain; },
      returning: result, limit: result,
      then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject),
    };
    return chain;
  }
  mocks.select.mockImplementation(() => query("select"));
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    select: () => query("select"), insert: (table: unknown) => query("insert", table),
  }));
});

describe("callback owner / idempotência", () => {
  it("pausa somente o dono, com locks/claim na ordem correta e sem toggles", async () => {
    authorized();
    expect(await processInlineCallback(20, callback(), secret, now)).toEqual({ text: CALLBACK_TEXT.paused });
    expect(mocks.events.find(e => e.kind === "values" && e.table === telegramPreferences)?.value).toEqual({ userId: "owner", enabled: false });
    const upsert = mocks.events.find(e => e.kind === "upsert" && e.table === telegramPreferences)?.value as { set: unknown };
    expect(upsert.set).toEqual({ enabled: false, updatedAt: now });
    const stateIndex = mocks.events.findIndex(e => e.kind === "insert" && e.table === telegramChatState);
    expect(stateIndex).toBeLessThan(mocks.events.findIndex(e => e.kind === "from" && e.table === users));
    expect(mocks.events.filter(e => e.kind === "lock").map(e => e.value)).toEqual(["update", "update"]);
    const filters = mocks.events.filter(e => e.kind === "where").map(e => new PgDialect().sqlToQuery(e.value as SQL).params);
    expect(filters).toContainEqual(["123", "owner"]);
  });
  it.each(Object.keys(SILENCE_TYPES) as (keyof typeof SILENCE_TYPES)[])("silencia só a flag permitida %s, incluindo as flags0025", async action => {
    authorized(); const result = await processInlineCallback(20, callback(action), secret, now);
    expect(result.text).toContain(SILENCE_TYPES[action].label);
    const upsert = mocks.events.find(e => e.kind === "upsert" && e.table === telegramPreferences)?.value as { set: unknown };
    expect(upsert.set).toEqual({ [SILENCE_TYPES[action].field]: false, updatedAt: now });
    expect(result.text.length).toBeLessThanOrEqual(200);
  });
  it("replay do mesmo update não escreve preferência nem envia detalhes novamente", async () => {
    mocks.rows.push([linked], []);
    expect(await processInlineCallback(20, callback(), secret, now)).toEqual({ text: CALLBACK_TEXT.replay });
    expect(mocks.events.some(e => e.table === telegramPreferences)).toBe(false);
    const claim = mocks.events.find(e => e.kind === "upsert" && e.table === telegramChatState)?.value as { setWhere: SQL };
    expect(new PgDialect().sqlToQuery(claim.setWhere)).toMatchObject({ params: [20] });
  });
  it("limite compartilhado com mensagens barra a escrita", async () => {
    mocks.rows.push([linked], [{ count: 11 }]);
    expect(await processInlineCallback(20, callback(), secret, now)).toEqual({ text: CALLBACK_TEXT.limited });
    expect(mocks.events.some(e => e.table === telegramPreferences)).toBe(false);
  });
  it("sem vínculo, assinatura errada ou troca de dono não reivindicam o update", async () => {
    mocks.rows.push([]);
    expect(await processInlineCallback(20, callback(), secret, now)).toEqual({ text: CALLBACK_TEXT.denied });
    mocks.rows.push([linked]);
    expect(await processInlineCallback(20, callback(), "wrong-secret", now)).toEqual({ text: CALLBACK_TEXT.invalid });
    mocks.rows.push([{ ...linked, userId: "other-owner" }]);
    expect(await processInlineCallback(20, callback(), secret, now)).toEqual({ text: CALLBACK_TEXT.invalid });
    expect(mocks.events.some(e => e.kind === "insert")).toBe(false);
  });
  it.each([{ live: [] }, { live: [{ ...linked, createdAt: new Date("2026-11-11T00:00:00Z") }] }])("desconexão/revínculo durante o claim impede qualquer efeito", async ({ live }) => {
    authorized(1, live);
    expect(await processInlineCallback(20, callback(), secret, now)).toEqual({ text: CALLBACK_TEXT.denied });
    expect(mocks.events.some(e => e.table === telegramPreferences)).toBe(false);
  });
  it("callback expirado não consome quota, grupos e remetente diferente nem chegam ao banco", async () => {
    mocks.rows.push([linked]);
    expect(await processInlineCallback(20, callback(), secret, new Date("2026-11-14T00:00:00Z"))).toEqual({ text: CALLBACK_TEXT.expired });
    const bad = callback(); bad.from.id = 456;
    mocks.transaction.mockClear();
    expect(await processInlineCallback(20, bad, secret, now)).toEqual({ text: CALLBACK_TEXT.invalid });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("detalhes só retornam seção fixa após autorização, sem escrever preferências", async () => {
    authorized();
    expect(await processInlineCallback(20, callback("d1"), secret, now)).toEqual({ text: CALLBACK_TEXT.details, details: "d1" });
    expect(mocks.events.some(e => e.table === telegramPreferences)).toBe(false);
  });
  it("só anexa botões a resposta financeira com dono vinculado e chave configurada", async () => {
    mocks.rows.push([linked]);
    expect(await replyKeyboard(message, "Saldo", secret, now)).toHaveProperty("inline_keyboard");
    mocks.rows.push([]);
    expect(await replyKeyboard(message, "Saldo", secret, now)).toBeUndefined();
    mocks.select.mockClear();
    expect(await replyKeyboard({ ...message, text: "oi" }, "Bem-vindo", secret, now)).toBeUndefined();
    expect(await replyKeyboard(message, null, secret, now)).toBeUndefined();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("anexa botões de confirmação para mensagens de rascunho de lançamento", async () => {
    mocks.rows.push([linked], [{ id: "dr_test123" }]);
    const draftPrompt = "Confirmar despesa?\n• Mercado: R$ 35,00\n• Conta: Nubank";
    const kb = await replyKeyboard({ ...message, text: "mercado 35" }, draftPrompt, secret, now);
    expect(kb).toHaveProperty("inline_keyboard");
    expect(kb?.inline_keyboard[0].map(b => b.text)).toEqual(["✅ Confirmar", "❌ Cancelar"]);
  });
});
