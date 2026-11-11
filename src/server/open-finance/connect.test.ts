import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "user-owner-1",
  profile: "integracao_total" as "integracao_total" | "hibrido" | "manual",
  fetchMock: vi.fn(),
  dbRows: [] as unknown[],
  insertedConnections: [] as unknown[],
  syncOpenFinanceMock: vi.fn(),
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
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mocks.dbRows)),
        })),
      })),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((val) => {
        mocks.insertedConnections.push(val);
        return {
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  },
}));

import {
  getPluggyConnectToken,
  connectPluggyItem,
  getOpenFinanceSetup,
} from "@/server/actions/open-finance";
import { isUserAllowedForOpenFinance } from "@/server/open-finance/access";

describe("Open Finance via Pluggy Connect Widget (TDD)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-owner-1";
    mocks.profile = "integracao_total";
    mocks.dbRows = [];
    mocks.insertedConnections = [];
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    process.env.PLUGGY_CLIENT_ID = "test-client-id";
    process.env.PLUGGY_CLIENT_SECRET = "test-client-secret";
    process.env.OPEN_FINANCE_ALLOWED_USER_IDS = "user-owner-1,user-owner-2";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  describe("isUserAllowedForOpenFinance", () => {
    it("retorna unavailable se PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET ausentes", () => {
      delete process.env.PLUGGY_CLIENT_ID;
      expect(isUserAllowedForOpenFinance("user-owner-1")).toEqual({
        allowed: false,
        reason: "unavailable",
      });
    });

    it("retorna forbidden se OPEN_FINANCE_ALLOWED_USER_IDS vazio ou usuário não permitido", () => {
      process.env.OPEN_FINANCE_ALLOWED_USER_IDS = "";
      expect(isUserAllowedForOpenFinance("user-owner-1")).toEqual({
        allowed: false,
        reason: "forbidden",
      });

      process.env.OPEN_FINANCE_ALLOWED_USER_IDS = "user-outro";
      expect(isUserAllowedForOpenFinance("user-owner-1")).toEqual({
        allowed: false,
        reason: "forbidden",
      });
    });

    it("retorna allowed se credenciais presentes e usuário na lista", () => {
      expect(isUserAllowedForOpenFinance("user-owner-1")).toEqual({
        allowed: true,
      });
    });
  });

  describe("getPluggyConnectToken", () => {
    it("rejeita com mensagem amigável quando credenciais não configuradas", async () => {
      delete process.env.PLUGGY_CLIENT_ID;
      const res = await getPluggyConnectToken();
      expect(res).toEqual({
        error: "Open Finance indisponível.",
        unavailable: true,
      });
    });

    it("rejeita com mensagem amigável quando usuário não estiver na lista permitida", async () => {
      mocks.userId = "attacker-user";
      const res = await getPluggyConnectToken();
      expect(res).toEqual({
        error: "Acesso ao Open Finance não autorizado para este usuário.",
        forbidden: true,
      });
    });

    it("rejeita se perfil de uso for manual", async () => {
      mocks.profile = "manual";
      const res = await getPluggyConnectToken();
      expect(res.error).toContain("Somente manual");
    });

    it("gera connectToken autenticando no servidor com clientUserId do usuário", async () => {
      const fetchCalls: { url: string; body?: unknown }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
          const body = opts?.body ? JSON.parse(opts.body as string) : undefined;
          fetchCalls.push({ url, body });
          if (url.endsWith("/auth")) {
            return new Response(JSON.stringify({ apiKey: "temp-api-key" }), { status: 200 });
          }
          if (url.endsWith("/connect_token")) {
            return new Response(JSON.stringify({ accessToken: "mock-connect-token-xyz" }), { status: 200 });
          }
          return new Response("Not found", { status: 404 });
        }),
      );

      const res = await getPluggyConnectToken();
      expect(res).toEqual({
        ok: true,
        connectToken: "mock-connect-token-xyz",
      });

      // Valida chamada de auth
      expect(fetchCalls[0].url).toContain("/auth");
      expect(fetchCalls[0].body).toEqual({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
      });

      // Valida chamada de connect_token com clientUserId correto
      expect(fetchCalls[1].url).toContain("/connect_token");
      expect(fetchCalls[1].body).toMatchObject({
        clientUserId: "user-owner-1",
      });
    });
  });

  describe("connectPluggyItem (salvar itemId e proteção IDOR)", () => {
    it("rejeita se o item retornado pela Pluggy não pertencer ao clientUserId do usuário autenticado", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.endsWith("/auth")) {
            return new Response(JSON.stringify({ apiKey: "temp-api-key" }), { status: 200 });
          }
          if (url.includes("/items/")) {
            // Item pertence a outro usuário!
            return new Response(
              JSON.stringify({
                id: "item-victim",
                clientUserId: "victim-user",
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

    it("salva a conexão quando item pertence ao usuário autenticado", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.endsWith("/auth")) {
            return new Response(JSON.stringify({ apiKey: "temp-api-key" }), { status: 200 });
          }
          if (url.includes("/items/")) {
            return new Response(
              JSON.stringify({
                id: "item-valid",
                clientUserId: "user-owner-1",
                status: "UPDATED",
              }),
              { status: 200 },
            );
          }
          return new Response("Not found", { status: 404 });
        }),
      );

      const res = await connectPluggyItem({ itemId: "item-valid" });
      expect(res.ok).toBe(true);
      expect(mocks.insertedConnections).toHaveLength(1);
      expect(mocks.insertedConnections[0]).toMatchObject({
        userId: "user-owner-1",
        label: "Conexão Pluggy",
      });
    });
  });

  describe("getOpenFinanceSetup", () => {
    it("indica isAvailable = false e sem erros se as variáveis de ambiente não estiverem configuradas", async () => {
      delete process.env.PLUGGY_CLIENT_ID;
      mocks.dbRows = [];

      const setup = await getOpenFinanceSetup();
      expect(setup.isAvailable).toBe(false);
      expect(setup.connections).toEqual([]);
    });

    it("indica isAvailable = true se credenciais configuradas e usuário permitido", async () => {
      mocks.dbRows = [];

      const setup = await getOpenFinanceSetup();
      expect(setup.isAvailable).toBe(true);
    });
  });
});
