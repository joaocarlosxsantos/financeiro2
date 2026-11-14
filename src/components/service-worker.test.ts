import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type ClickEvent = {
  notification: { data: Record<string, unknown>; close: () => void };
  waitUntil: (promise: Promise<unknown>) => void;
};

function clickPush(data: Record<string, unknown>) {
  const listeners = new Map<string, (event: ClickEvent) => void>();
  const navigated: string[] = [];
  const focus = vi.fn();
  const client = {
    url: "https://financeiro.test/painel",
    navigate: vi.fn(async (url: string) => { navigated.push(url); }),
    focus,
  };
  const waitUntil: Promise<unknown>[] = [];
  const self = {
    location: { origin: "https://financeiro.test" },
    clients: { matchAll: async () => [client], openWindow: vi.fn() },
    addEventListener: (name: string, callback: (event: ClickEvent) => void) => listeners.set(name, callback),
  };
  const fetch = vi.fn(async () => { throw new Error("offline"); });
  const source = readFileSync("public/sw.js", "utf8");
  runInNewContext(source, { self, URL, Promise, fetch });
  listeners.get("notificationclick")!({
    notification: { data, close: vi.fn() },
    waitUntil: promise => waitUntil.push(promise),
  });
  return { navigated, fetch, waitUntil, focus };
}

describe("service worker notification click", () => {
  it("opens the internal destination when marking read fails", async () => {
    const result = clickPush({ url: "/contas-a-pagar", noticeId: "notice_123" });
    await Promise.all(result.waitUntil);
    expect(result.navigated).toEqual(["https://financeiro.test/contas-a-pagar"]);
    expect(result.fetch).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({
      method: "POST", credentials: "same-origin", keepalive: true,
      body: JSON.stringify({ action: "read", id: "notice_123" }),
    }));
    expect(result.focus).toHaveBeenCalled();
  });

  it("rejects external destinations and still opens the inbox", async () => {
    const result = clickPush({ url: "https://evil.test/" });
    await Promise.all(result.waitUntil);
    expect(result.navigated).toEqual(["https://financeiro.test/notificacoes"]);
    expect(result.fetch).not.toHaveBeenCalled();
  });
});
