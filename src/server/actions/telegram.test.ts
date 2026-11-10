import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), issue: vi.fn(), disconnect: vi.fn(), limit: vi.fn(), loadPrefs: vi.fn(), savePrefs: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUserId: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/server/telegram/store", () => ({ issueLink: mocks.issue, disconnect: mocks.disconnect }));
vi.mock("@/server/telegram/insight-store", () => ({ getTelegramPreferences: mocks.loadPrefs, setTelegramPreferences: mocks.savePrefs }));
import { createTelegramLink, disconnectTelegram, loadTelegramPreferences, saveTelegramPreferences } from "./telegram";
import { DEFAULT_PREFERENCES } from "@/server/telegram/insights";

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mocks.auth.mockResolvedValue("session-owner");
  mocks.limit.mockReturnValue({ allowed: true });
});

describe("actions Telegram", () => {
  it("rejeita chamadas sem sessão antes de banco/API externa", async () => {
    mocks.auth.mockRejectedValue(new Error("unauthenticated"));
    await expect(createTelegramLink()).rejects.toThrow("unauthenticated");
    await expect(disconnectTelegram()).rejects.toThrow("unauthenticated");
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
  it("não emite link sem configuração ou com limite atingido", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect((await createTelegramLink()).error).toBeTruthy();
    mocks.limit.mockReturnValue({ allowed: false });
    expect((await createTelegramLink()).error).toContain("Aguarde");
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("obtém nome do bot e emite código para a sessão, ignorando argumentos forjados", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-test-token");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "fake-test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, result: { username: "mutano_bot" } })));
    mocks.issue.mockResolvedValue({ code: "one-time-code", expiresAt: new Date("2026-11-10T12:00:00Z") });
    const call = createTelegramLink as (...args: unknown[]) => ReturnType<typeof createTelegramLink>;
    const result = await call({ userId: "attacker" });
    expect(mocks.issue).toHaveBeenCalledWith("session-owner");
    expect(result.url).toBe("https://t.me/mutano_bot?start=one-time-code");
  });
  it("falhas não vazam token nem detalhes internos", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-test-token");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "fake-test-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fake-test-token database credentials")));
    expect(JSON.stringify(await createTelegramLink())).not.toContain("fake-test-token");
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("desconecta somente o usuário autenticado", async () => {
    const call = disconnectTelegram as (...args: unknown[]) => ReturnType<typeof disconnectTelegram>;
    expect(await call("attacker")).toEqual({ disconnected: true });
    expect(mocks.disconnect).toHaveBeenCalledWith("session-owner");
  });
  it("carrega e salva preferências somente da sessão", async () => {
    mocks.loadPrefs.mockResolvedValue(DEFAULT_PREFERENCES);
    expect((await loadTelegramPreferences()).prefs).toEqual(DEFAULT_PREFERENCES);
    expect(mocks.loadPrefs).toHaveBeenCalledWith("session-owner");
    expect((await saveTelegramPreferences(DEFAULT_PREFERENCES)).ok).toBe(true);
    expect(mocks.savePrefs).toHaveBeenCalledWith("session-owner", DEFAULT_PREFERENCES);
  });
  it("rejeita dono forjado, horários não atendidos e dados inválidos", async () => {
    for (const input of [{ ...DEFAULT_PREFERENCES, userId: "attacker" }, { ...DEFAULT_PREFERENCES, hours: [9] }, { ...DEFAULT_PREFERENCES, hours: [] }, { ...DEFAULT_PREFERENCES, enabled: "true" }]) {
      expect((await saveTelegramPreferences(input)).error).toBeTruthy();
    }
    expect(mocks.savePrefs).not.toHaveBeenCalled();
  });
  it("sessão ausente também impede alteração de preferências", async () => {
    mocks.auth.mockRejectedValue(new Error("unauthenticated"));
    await expect(saveTelegramPreferences(DEFAULT_PREFERENCES)).rejects.toThrow();
    await expect(loadTelegramPreferences()).rejects.toThrow();
    expect(mocks.savePrefs).not.toHaveBeenCalled();
  });
});
