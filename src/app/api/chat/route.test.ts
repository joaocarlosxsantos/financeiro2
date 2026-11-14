import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), exists: vi.fn(), limit: vi.fn(), reply: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: () => mocks.auth() }));
vi.mock("@/server/telegram/site-chat", () => ({ siteChatOwnerExists: (...args: unknown[]) => mocks.exists(...args),
  claimSiteChatRequest: (...args: unknown[]) => mocks.limit(...args), siteCommandReply: (...args: unknown[]) => mocks.reply(...args) }));
import { POST } from "./route";
const request = (body: unknown = { command: "/saldo" }, headers: Record<string, string> = {}) => new Request("https://app.test/api/chat", {
  method: "POST", headers: { origin: "https://app.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "session-owner" } });
  mocks.exists.mockResolvedValue(true); mocks.limit.mockResolvedValue({ allowed: true }); mocks.reply.mockResolvedValue("Saldo registrado");
});
describe("Chat HTTP autenticado", () => {
  it("exige sessão antes de acessar dados ou consumir cota", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401); expect(mocks.exists).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("rejeita sessão de usuário removido", async () => {
    mocks.exists.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(401); expect(mocks.reply).not.toHaveBeenCalled();
  });
  it("usa somente o dono da sessão e não permite cache compartilhado", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ reply: "Saldo registrado" });
    expect(mocks.reply).toHaveBeenCalledWith("session-owner", "/saldo");
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  });
  it.each([{ command: "/saldo", userId: "other" }, { command: "/saldo", chatId: "other" },
    { command: "/saldo other" }, { command: "/start secret" }, { command: "<script>alert(1)</script>" },
    { command: "meus gastos" }, { command: "/desfazer" }, { command: { $ne: null } }])("rejeita injeção/identidade/texto livre: %j", async body => {
    expect((await POST(request(body))).status).toBe(400); expect(mocks.reply).not.toHaveBeenCalled();
  });
  it("rejeita origem externa, ausente e fetch cross-site", async () => {
    const origins: Record<string, string>[] = [{ origin: "https://evil.test" }, { origin: "" }, { "sec-fetch-site": "cross-site" }];
    for (const headers of origins)
      expect((await POST(request(undefined, headers))).status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("rejeita tipo de conteúdo e corpo excessivo inclusive sem Content-Length", async () => {
    expect((await POST(request({}, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request({ command: "x".repeat(9000) }))).status).toBe(400);
    expect(mocks.reply).not.toHaveBeenCalled();
  });
  it("aplica cota antes de executar, retorna Retry-After e falha fechado", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 35 });
    const response = await POST(request());
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("35"); expect(mocks.reply).not.toHaveBeenCalled();
    mocks.limit.mockRejectedValue(new Error("database secret"));
    const failed = await POST(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("secret");
  });
});
