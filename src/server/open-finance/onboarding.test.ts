import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFailures } from "@/lib/rate-limit";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), restriction: vi.fn(), authenticate: vi.fn(), item: vi.fn(), accounts: vi.fn(), sync: vi.fn(),
  stored: [] as unknown[], localAccount: [] as unknown[], connectionEnvelope: "", writes: [] as Record<string, unknown>[] }));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.auth() }));
vi.mock("@/server/usage-profile", () => ({ getProfileRestriction: (...args: unknown[]) => mocks.restriction(...args) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./client", async original => ({ ...await original<typeof import("./client")>(), authenticatePluggy: mocks.authenticate,
  getPluggyItem: mocks.item, getPluggyAccounts: mocks.accounts }));
vi.mock("./sync", () => ({ resolvePluggyApiKey: async () => "server-api-key", safeError: () => "Falha segura. Confira a conexão.", syncOpenFinanceForUser: (...args: unknown[]) => mocks.sync(...args) }));
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const insert = () => ({ values: (values: Record<string, unknown>) => { mocks.writes.push(values); return { onConflictDoUpdate: async () => undefined }; } });
  const update = () => ({ set: (values: Record<string, unknown>) => { mocks.writes.push(values); return { where: async () => undefined }; } });
  return { db: { insert,
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === schema.openFinanceCredentials ? mocks.stored : table === schema.accounts ? mocks.localAccount : [{ id: "c0000000000000000000000001", itemIdEnvelope: mocks.connectionEnvelope }] }) }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ insert, update }),
  } };
});
import { connectPluggyItem, linkOpenFinanceAccount, saveOpenFinanceCredentials, saveOpenFinanceSetup } from "@/server/actions/open-finance";
import { decryptSecret, encryptSecret } from "./crypto";

const credentials = { clientId: "opaque-id-not-a-uuid", clientSecret: "test-secret-value" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.stored = []; mocks.localAccount = []; mocks.writes = [];
  vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
  mocks.connectionEnvelope = encryptSecret("widget-item", "owner", "itemId");
  mocks.auth.mockResolvedValue("owner"); mocks.restriction.mockResolvedValue(null); mocks.authenticate.mockResolvedValue("api-key");
  mocks.item.mockResolvedValue({ id: "widget-item", clientUserId: "owner", status: "UPDATED" }); mocks.accounts.mockResolvedValue([]);
  mocks.sync.mockResolvedValue({ ok: true, status: "UPDATED", imported: 0, accounts: [{ status: "OK" }] });
  for (const name of ["creds", "connect", "setup"]) clearFailures(`open-finance-${name}:owner`);
});
afterEach(() => vi.unstubAllEnvs());

describe("Onboarding Pluggy sem Demo e sem vazamento", () => {
  it("novo vínculo exige sync local; repetir vínculo idêntico preserva progresso sem novo consentimento", async () => {
    const accountId = "a0000000000000000000000001", connectionId = "c0000000000000000000000001";
    mocks.localAccount = [{ id: accountId, type: "CHECKING", financeMode: "manual", externalAccountId: null, externalConnectionId: null }];
    mocks.accounts.mockResolvedValue([{ id: "external", type: "BANK" }]);
    const input = { accountId, connectionId, externalAccountId: "external", mode: "integracao" as const };
    expect(await linkOpenFinanceAccount(input)).toEqual({ ok: true });
    expect(mocks.writes).toContainEqual({ status: "NOT_SYNCED", lastErrorCode: null });
    mocks.localAccount = [{ id: accountId, type: "CHECKING", financeMode: "integracao", externalAccountId: "external", externalConnectionId: connectionId }];
    mocks.writes = [];
    expect(await linkOpenFinanceAccount(input)).toEqual({ ok: true }); expect(mocks.writes).toEqual([]);
  });
  it("valida valores opacos no servidor, guarda AES-GCM existente e não devolve credenciais", async () => {
    const result = await saveOpenFinanceCredentials(credentials);
    expect(result).toEqual({ ok: true }); expect(mocks.authenticate).toHaveBeenCalledWith(credentials.clientId, credentials.clientSecret);
    const saved = mocks.writes[0]; expect(saved.userId).toBe("owner");
    expect(decryptSecret(String(saved.clientSecretEnvelope), "owner", "clientSecret")).toBe(credentials.clientSecret);
    expect(() => decryptSecret(String(saved.clientSecretEnvelope), "other", "clientSecret")).toThrow();
    expect(JSON.stringify(result)).not.toContain(credentials.clientSecret);
  });
  it("par inválido não substitui credenciais anteriores e erro não repete secret", async () => {
    mocks.stored = [{ clientSecretEnvelope: "existing-envelope" }]; mocks.authenticate.mockRejectedValue(new Error(`credential=${credentials.clientSecret}`));
    expect((await saveOpenFinanceCredentials(credentials)).error).toBeTruthy(); expect(mocks.writes).toHaveLength(0);
    expect(JSON.stringify(await saveOpenFinanceCredentials(credentials))).not.toContain(credentials.clientSecret);
  });
  it.each(["CLIENT_SECRET=wrong-value", '"quoted-secret"', "secret with spaces", "x".repeat(1001)])("rejeita cópia incorreta ou excessiva antes da API: %s", async clientSecret => {
    expect((await saveOpenFinanceCredentials({ ...credentials, clientSecret })).error).toBeTruthy();
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.writes).toHaveLength(0);
  });
  it.each([null, "other-owner"])("widget e caminho legado rejeitam item sem dono compatível: %s", async clientUserId => {
    mocks.item.mockResolvedValue({ clientUserId, status: "UPDATED" });
    expect((await connectPluggyItem({ itemId: "demo-or-foreign-item" })).error).toBeTruthy();
    expect((await saveOpenFinanceSetup({ ...credentials, itemId: "demo-or-foreign-item", importFromDate: "2026-01-01" })).error).toBeTruthy();
    expect(mocks.accounts).not.toHaveBeenCalled(); expect(mocks.writes).toHaveLength(0);
  });
  it("múltiplos bancos usam identidades distintas, sem listar/importar itens do Demo", async () => {
    for (const itemId of ["bank-one", "bank-two"]) {
      const result = await connectPluggyItem({ itemId });
      expect(result).toMatchObject({ ok: true, connected: true, initialSync: { state: "completed", imported: 0, accountCount: 1 } });
    }
    expect(mocks.writes).toHaveLength(2);
    expect(mocks.writes[0].itemIdHash).not.toBe(mocks.writes[1].itemIdHash);
    expect(mocks.item.mock.calls.map(c => c[1])).toEqual(["bank-one", "bank-two"]);
  });
  it("conexão autorizada não esconde sync parcial, pendente ou falho", async () => {
    mocks.sync.mockResolvedValueOnce({ ok: true, status: "ERROR", imported: 1, accounts: [{ status: "OK" }, { status: "ERROR", error: "private-secret" }] })
      .mockResolvedValueOnce({ skipped: true, error: "private-secret" }).mockRejectedValueOnce(new Error("private-secret"));
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await connectPluggyItem({ itemId: `own-item-${i}` }));
    expect(results.map(r => r.initialSync?.state)).toEqual(["partial", "pending", "failed"]);
    expect(results.every(r => r.ok && r.connected)).toBe(true); expect(JSON.stringify(results)).not.toContain("private-secret");
  });
  it("não grava nada sem sessão/capacidade e respeita o limite existente de tentativas", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("unauthenticated"));
    await expect(saveOpenFinanceCredentials(credentials)).rejects.toThrow("unauthenticated");
    mocks.restriction.mockResolvedValueOnce("Modo manual."); expect((await connectPluggyItem({ itemId: "own" })).error).toBe("Modo manual.");
    mocks.authenticate.mockRejectedValue(new Error("bad pair"));
    for (let i = 0; i < 10; i++) await saveOpenFinanceCredentials(credentials);
    const limited = await saveOpenFinanceCredentials(credentials);
    expect(limited.error).toContain("Muitas tentativas"); expect(mocks.authenticate).toHaveBeenCalledTimes(10); expect(mocks.writes).toHaveLength(0);
  });
});
