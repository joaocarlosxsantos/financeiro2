import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), findConnection: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("./crypto", () => ({ secretFingerprint: (value: string) => `hash:${value}` }));
vi.mock("./sync", () => ({ syncOpenFinanceForUser: mocks.sync }));
vi.mock("@/server/notifications/dispatcher", () => ({ notificationDispatcher: { dispatch: mocks.dispatch } }));

import { handlePluggyWebhook } from "./webhook";

const secret = "pluggy-secret";
const scheduled: Array<() => Promise<void>> = [];
const deps = { findConnection: mocks.findConnection, schedule: (task: () => Promise<void>) => { scheduled.push(task); } };
const request = (body: unknown, headers: Record<string, string> = { "x-webhook-secret": secret }) =>
  new Request("https://app.test/api/open-finance/webhook", { method: "POST", headers, body: JSON.stringify(body) });
const updated = (eventId: string, itemId = "item-1", clientUserId = "owner-1") => ({
  event: "item/updated", eventId, itemId, clientUserId, clientId: "client-app", triggeredBy: "SYNC",
});

afterEach(() => { vi.clearAllMocks(); scheduled.length = 0; });

describe("webhook Pluggy item/updated", () => {
  it("sem segredo configurado responde 503", async () => {
    const response = await handlePluggyWebhook(request(updated("e-503")), undefined, deps);
    expect(response.status).toBe(503);
    expect(mocks.findConnection).not.toHaveBeenCalled();
  });

  it("rejeita segredo errado/ausente sem consultar a conexão", async () => {
    expect((await handlePluggyWebhook(request(updated("e-401"), { "x-webhook-secret": "wrong" }), secret, deps)).status).toBe(401);
    expect((await handlePluggyWebhook(request(updated("e-401b"), {}), secret, deps)).status).toBe(401);
    expect(mocks.findConnection).not.toHaveBeenCalled();
  });

  it("autentica, localiza a conexão e agenda o sync sem PATCH depois do ACK", async () => {
    mocks.findConnection.mockResolvedValue({ id: "conn-1", userId: "owner-1" });
    mocks.sync.mockResolvedValue({ ok: true, status: "UPDATED", imported: 3 });
    mocks.dispatch.mockResolvedValue({});
    const response = await handlePluggyWebhook(request(updated("e-202", "private-item", "owner-1")), secret, deps);
    expect(response.status).toBe(202);
    expect(mocks.findConnection).toHaveBeenCalledWith("private-item", "owner-1");
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(mocks.sync).toHaveBeenCalledWith("owner-1", "conn-1", "webhook");
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-1", category: "syncAlerts", type: "pluggy_sync_updated" }));
  });

  it("ignora eventos que não sejam item/updated e item desconhecido", async () => {
    const ignored = await handlePluggyWebhook(request({ event: "item/error", eventId: "e-error", itemId: "item-1" }), secret, deps);
    expect(ignored.status).toBe(200);
    expect(mocks.findConnection).not.toHaveBeenCalled();
    mocks.findConnection.mockResolvedValue(null);
    const unknown = await handlePluggyWebhook(request(updated("e-unknown", "outro-item")), secret, deps);
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({ ignored: true });
    expect(scheduled).toHaveLength(0);
  });

  it("payload inválido responde 400 e corpo grande responde 413", async () => {
    expect((await handlePluggyWebhook(request({ event: "item/updated" }), secret, deps)).status).toBe(400);
    expect((await handlePluggyWebhook(request({ event: "item/updated", itemId: "item-1", eventId: 1 }), secret, deps)).status).toBe(400);
    const huge = new Request("https://app.test/api/open-finance/webhook", {
      method: "POST", headers: { "x-webhook-secret": secret, "content-length": String(20_000) }, body: "{}",
    });
    expect((await handlePluggyWebhook(huge, secret, deps)).status).toBe(413);
  });

  it("deduplica eventId e devolve 500 se o lookup falhar", async () => {
    mocks.findConnection.mockResolvedValue({ id: "conn-1", userId: "owner-1" });
    expect((await handlePluggyWebhook(request(updated("e-dup")), secret, deps)).status).toBe(202);
    const duplicate = await handlePluggyWebhook(request(updated("e-dup")), secret, deps);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ duplicate: true });
    expect(scheduled).toHaveLength(1);

    mocks.findConnection.mockRejectedValue(new Error("db down"));
    const failure = await handlePluggyWebhook(request(updated("e-db")), secret, deps);
    expect(failure.status).toBe(500);
  });
});

describe("webhook Pluggy: segredo na URL, eventos e dedupe estável", () => {
  const urlRequest = (body: unknown, query: string) =>
    new Request(`https://app.test/api/open-finance/webhook${query}`, { method: "POST", headers: {}, body: JSON.stringify(body) });

  it("aceita ?secret= quando o header não existe (painel Pluggy) e rejeita ?secret= errado", async () => {
    mocks.findConnection.mockResolvedValue({ id: "conn-q", userId: "owner-1" });
    expect((await handlePluggyWebhook(urlRequest(updated("e-q1"), `?secret=${secret}`), secret, deps)).status).toBe(202);
    expect((await handlePluggyWebhook(urlRequest(updated("e-q2"), "?secret=nope"), secret, deps)).status).toBe(401);
    expect((await handlePluggyWebhook(urlRequest(updated("e-q3"), ""), secret, deps)).status).toBe(401);
  });

  it("header com segredo errado não é salvo pelo ?secret= correto", async () => {
    const response = await handlePluggyWebhook(
      new Request(`https://app.test/api/open-finance/webhook?secret=${secret}`, { method: "POST", headers: { "x-webhook-secret": "wrong" }, body: JSON.stringify(updated("e-h")) }),
      secret,
      deps,
    );
    expect(response.status).toBe(401);
  });

  it("aceita transactions/created e ignora outros eventos", async () => {
    mocks.findConnection.mockResolvedValue({ id: "conn-t", userId: "owner-1" });
    const created = await handlePluggyWebhook(request({ event: "transactions/created", eventId: "e-tx", itemId: "item-1" }), secret, deps);
    expect(created.status).toBe(202);
    const other = await handlePluggyWebhook(request({ event: "item/login_succeeded", eventId: "e-ls", itemId: "item-1" }), secret, deps);
    expect(await other.json()).toMatchObject({ ignored: true });
  });

  it("chave de dedupe é estável: mesmo evento repetido não reagenda, e a notificação não usa Date.now", async () => {
    mocks.findConnection.mockResolvedValue({ id: "conn-s", userId: "owner-1" });
    mocks.sync.mockResolvedValue({ ok: true, status: "UPDATED", imported: 1 });
    mocks.dispatch.mockResolvedValue({});
    expect((await handlePluggyWebhook(request(updated("e-stable")), secret, deps)).status).toBe(202);
    expect((await handlePluggyWebhook(request(updated("e-stable")), secret, deps)).status).toBe(200);
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    const dedupeKey = mocks.dispatch.mock.calls[0]?.[0]?.dedupeKey as string;
    expect(dedupeKey).toMatch(/^pluggy_sync_[0-9a-f]{40}$/);
  });

  it("webhookEventKey: eventId diferente gera chave diferente; sem eventId usa hash do corpo", async () => {
    const { webhookEventKey } = await import("./webhook");
    expect(webhookEventKey("item/updated", "i", "a", "x")).not.toBe(webhookEventKey("item/updated", "i", "b", "x"));
    expect(webhookEventKey("item/updated", "i", undefined, "x")).toBe(webhookEventKey("item/updated", "i", undefined, "x"));
    expect(webhookEventKey("item/updated", "i", undefined, "x")).not.toBe(webhookEventKey("item/updated", "i", undefined, "y"));
  });
});
