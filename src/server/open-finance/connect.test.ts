import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "user-owner-1",
  profile: "integracao_total" as "integracao_total" | "hibrido" | "manual",
  fetchMock: vi.fn(),
  dbCredentials: [] as unknown[],
  dbConnections: [] as unknown[],
  dbAccounts: [] as unknown[],
  insertedCredentials: [] as unknown[],
  insertedConnections: [] as unknown[],
}));

vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn().mockImplementation(() => Promise.resolve(mocks.userId)),
}));

vi.mock("@/server/usage-profile", async () => {
  const { profileRestriction } = await import("@/lib/usage-profile");
  return {
    getProfileRestriction: async (_userId: string, capability: "manual-entry" | "integration") =>
      profileRestriction(mocks.profile, capability),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockImplementation((fields) => {
      // Diferencia seleção de credentials x connections
      return {
        from: vi.fn().mockImplementation((table) => {
          const isCredentials = table?.tableName === "open_finance_credentials" || Boolean(fields?.clientIdEnvelope);
          return {
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                if (isCredentials) {
                  return Promise.resolve(mocks.dbCredentials);
                }
                return Promise.resolve(mocks.dbConnections);
              }),
            })),
          };
        }),
      };
    }),
    insert: vi.fn().mockImplementation((table) => ({
      values: vi.fn().mockImplementation((val) => {
        if (table?.tableName === "open_finance_credentials" || val.clientIdEnvelope) {
          mocks.insertedCredentials.push(val);
        } else {
          mocks.insertedConnections.push(val);
        }
        return {
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  },
}));

import {
  saveOpenFinanceCredentials,
  getOpenFinanceSetup,
  getPluggyConnectToken,
  connectPluggyItem,
} from "@/server/actions/open-finance";
import { decryptSecret, encryptSecret } from "@/server/open-finance/crypto";
import { maskClientId } from "@/server/open-finance/access";

describe("Open Finance F14: Credenciais Pluggy por usuário (TDD)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-owner-1";
    mocks.profile = "integracao_total";
    mocks.dbCredentials = [];
    mocks.dbConnections = [];
    mocks.dbAccounts = [];
    mocks.insertedCredentials = [];
    mocks.insertedConnections = [];
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    // Garante que não depende de envs antigas
    delete process.env.PLUGGY_CLIENT_ID;
    delete process.env.PLUGGY_CLIENT_SECRET;
    delete process.env.OPEN_FINANCE_ALLOWED_USER_IDS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  describe("maskClientId", () => {
    it("mascara client ID preservando apenas os 4 últimos dígitos", () => {
      expect(maskClientId("client-uuid-1234")).toBe("••••1234");
      expect(maskClientId("123")).toBe("••••");
      expect(maskClientId("")).toBe("••••");
    });
  });

  describe("saveOpenFinanceCredentials", () => {
    it("valida credenciais na Pluggy antes de salvar e persiste com AES-256-GCM cifrado por usuário", async () => {
      const fetchCalls: { url: string; body?: unknown }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
          fetchCalls.push({ url, body: opts?.body ? JSON.parse(opts.body as string) : undefined });
          if (url.endsWith("/auth")) {
            return new Response(JSON.stringify({ apiKey: "valid-api-key" }), { status: 200 });
          }
          return new Response("Not found", { status: 404 });
        }),
      );

      const res = await saveOpenFinanceCredentials({
        clientId: "my-personal-client-id-9876",
        clientSecret: "my-personal-client-secret-sec",
      });

      expect(res).toEqual({ ok: true });
      expect(fetchCalls[0].url).toContain("/auth");
      expect(fetchCalls[0].body).toEqual({
        clientId: "my-personal-client-id-9876",
        clientSecret: "my-personal-client-secret-sec",
      });

      // Valida persistência cifrada
      expect(mocks.insertedCredentials).toHaveLength(1);
      const saved = mocks.insertedCredentials[0] as {
        userId: string;
        clientIdEnvelope: string;
        clientSecretEnvelope: string;
      };
      expect(saved.userId).toBe("user-owner-1");
      expect(saved.clientIdEnvelope).toMatch(/^v1\./);
      expect(saved.clientSecretEnvelope).toMatch(/^v1\./);
      expect(saved.clientSecretEnvelope).not.toContain("my-personal-client-secret-sec");

      // Pode ser descriptografado com o userId correto
      const decryptedSecret = decryptSecret(saved.clientSecretEnvelope, "user-owner-1", "clientSecret");
      expect(decryptedSecret).toBe("my-personal-client-secret-sec");
    });

    it("rejeita credenciais inválidas na Pluggy sem persistir no banco", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.endsWith("/auth")) {
            return new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 });
          }
          return new Response("Not found", { status: 404 });
        }),
      );

      const res = await saveOpenFinanceCredentials({
        clientId: "invalid-id",
        clientSecret: "invalid-secret",
      });

      expect(res.error).toBeDefined();
      expect(mocks.insertedCredentials).toHaveLength(0);
    });

    it("bloqueia se perfil de uso for manual", async () => {
      mocks.profile = "manual";
      const res = await saveOpenFinanceCredentials({
        clientId: "client-id",
        clientSecret: "client-secret",
      });
      expect(res.error).toContain("Somente manual");
      expect(mocks.insertedCredentials).toHaveLength(0);
    });
  });

  describe("getOpenFinanceSetup", () => {
    it("sem credenciais salvas retorna credentialConfigured: false e clientIdMasked: null", async () => {
      mocks.dbCredentials = [];
      const setup = await getOpenFinanceSetup();
      expect(setup.credentialConfigured).toBe(false);
      expect(setup.clientIdMasked).toBeNull();
      // O secret nunca existe no retorno
      expect((setup as unknown as Record<string, unknown>).clientSecret).toBeUndefined();
    });

    it("com credenciais salvas retorna credentialConfigured: true e clientIdMasked sem expor segredo", async () => {
      const encryptedClient = encryptSecret("client-uuid-5678", "user-owner-1", "clientId");
      const encryptedSecret = encryptSecret("super-secret-1234", "user-owner-1", "clientSecret");

      mocks.dbCredentials = [
        {
          userId: "user-owner-1",
          clientIdEnvelope: encryptedClient,
          clientSecretEnvelope: encryptedSecret,
          updatedAt: new Date(),
        },
      ];

      const setup = await getOpenFinanceSetup();
      expect(setup.credentialConfigured).toBe(true);
      expect(setup.clientIdMasked).toBe("••••5678");
      // Garante que o segredo não vaza no payload
      expect((setup as unknown as Record<string, unknown>).clientSecret).toBeUndefined();
      expect((setup as unknown as Record<string, unknown>).clientSecretEnvelope).toBeUndefined();
    });
  });

  describe("getPluggyConnectToken", () => {
    it("sem credenciais configuradas para o usuário, retorna needsCredentials: true", async () => {
      mocks.dbCredentials = [];
      const res = await getPluggyConnectToken();
      expect(res).toEqual({
        error: "Configure suas credenciais da Pluggy antes de conectar.",
        needsCredentials: true,
      });
    });

    it("com credenciais configuradas, descriptografa as chaves daquele usuário e chama a Pluggy com clientUserId", async () => {
      const encryptedClient = encryptSecret("user1-client-id", "user-owner-1", "clientId");
      const encryptedSecret = encryptSecret("user1-secret-key", "user-owner-1", "clientSecret");

      mocks.dbCredentials = [
        {
          userId: "user-owner-1",
          clientIdEnvelope: encryptedClient,
          clientSecretEnvelope: encryptedSecret,
          updatedAt: new Date(),
        },
      ];

      const fetchCalls: { url: string; body?: unknown }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
          fetchCalls.push({ url, body: opts?.body ? JSON.parse(opts.body as string) : undefined });
          if (url.endsWith("/auth")) {
            return new Response(JSON.stringify({ apiKey: "user1-api-key" }), { status: 200 });
          }
          if (url.endsWith("/connect_token")) {
            return new Response(JSON.stringify({ accessToken: "token-for-user1" }), { status: 200 });
          }
          return new Response("Not found", { status: 404 });
        }),
      );

      const res = await getPluggyConnectToken();
      expect(res).toEqual({
        ok: true,
        connectToken: "token-for-user1",
      });

      // Validar que usou as credenciais do usuário 1
      expect(fetchCalls[0].body).toEqual({
        clientId: "user1-client-id",
        clientSecret: "user1-secret-key",
      });
      // Validar que o connectToken foi criado para o clientUserId correto
      expect(fetchCalls[1].body).toMatchObject({
        clientUserId: "user-owner-1",
      });
    });

    it("isolamento: usuário B não consegue descriptografar credenciais do usuário A", async () => {
      // Credenciais foram cifradas pelo usuário A
      const encryptedClientA = encryptSecret("userA-client-id", "user-A", "clientId");
      const encryptedSecretA = encryptSecret("userA-secret-key", "user-A", "clientSecret");

      // Mas a sessão ativa é do usuário B
      mocks.userId = "user-B";
      mocks.dbCredentials = [
        {
          userId: "user-B",
          clientIdEnvelope: encryptedClientA,
          clientSecretEnvelope: encryptedSecretA,
          updatedAt: new Date(),
        },
      ];

      // Tentar descriptografar deve falhar (AAD mismatch no AES-GCM)
      expect(() => {
        decryptSecret(encryptedSecretA, "user-B", "clientSecret");
      }).toThrow();

      const res = await getPluggyConnectToken();
      expect(res.error).toBeDefined();
    });
  });

  describe("connectPluggyItem (Anti-IDOR com credenciais do usuário)", () => {
    it("rejeita itemId que não pertence ao clientUserId do usuário na Pluggy", async () => {
      const encryptedClient = encryptSecret("my-client", "user-owner-1", "clientId");
      const encryptedSecret = encryptSecret("my-secret", "user-owner-1", "clientSecret");

      mocks.dbCredentials = [
        {
          userId: "user-owner-1",
          clientIdEnvelope: encryptedClient,
          clientSecretEnvelope: encryptedSecret,
          updatedAt: new Date(),
        },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.endsWith("/auth")) {
            return new Response(JSON.stringify({ apiKey: "temp-api-key" }), { status: 200 });
          }
          if (url.includes("/items/")) {
            // Item pertence a outro usuário
            return new Response(
              JSON.stringify({
                id: "item-victim",
                clientUserId: "victim-user-999",
                status: "UPDATED",
              }),
              { status: 200 },
            );
          }
          return new Response("Not found", { status: 404 });
        }),
      );

      const res = await connectPluggyItem({ itemId: "item-victim" });
      expect(res.error).toBe("Item não autorizado para este usuário.");
      expect(mocks.insertedConnections).toHaveLength(0);
    });
  });
});
