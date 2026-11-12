import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { issueExportToken, verifyExportToken, verifyUserPassword, reauthenticateForExport } from "./reauth";
import bcrypt from "bcryptjs";
import { clearFailures } from "./rate-limit";

// Mocks do banco de dados
const mockUser = {
  id: "user-123",
  passwordHash: bcrypt.hashSync("minha-senha-secreta", 8),
};

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [mockUser],
        }),
      }),
    }),
  },
}));

describe("reauth and export tokens", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    clearFailures("reauth:user-123");
  });

  it("gera e valida token assinado para o usuário correto", () => {
    const token = issueExportToken("user-123", 60_000);
    expect(typeof token).toBe("string");
    expect(verifyExportToken(token, "user-123")).toBe(true);
  });

  it("rejeita token quando o usuário destino é diferente (prevenção de impersonation)", () => {
    const token = issueExportToken("user-123", 60_000);
    expect(verifyExportToken(token, "outro-usuario")).toBe(false);
  });

  it("rejeita token expirado", () => {
    const expiredToken = issueExportToken("user-123", -1000);
    expect(verifyExportToken(expiredToken, "user-123")).toBe(false);
  });

  it("rejeita token adulterado", () => {
    const token = issueExportToken("user-123", 60_000);
    const tampered = token.slice(0, -4) + "AAAA";
    expect(verifyExportToken(tampered, "user-123")).toBe(false);
  });

  it("lança erro caso secret não esteja configurado fora de test", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", undefined);
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    expect(() => issueExportToken("user-123", 60_000)).toThrow("AUTH_SECRET não definida");
  });

  it.each(["AUTH_SECRET", "NEXTAUTH_SECRET"])("rejeita o placeholder público de .env.example em %s", key => {
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const placeholder = /^AUTH_SECRET="([^"]+)"/m.exec(example)?.[1];
    expect(placeholder).toBeTruthy();
    vi.stubEnv("AUTH_SECRET", undefined);
    vi.stubEnv("NEXTAUTH_SECRET", undefined);
    vi.stubEnv(key, placeholder);
    expect(() => issueExportToken("user-123")).toThrow("diferente do exemplo");
    const payload = `user-123.${Date.now() + 60_000}`;
    const forged = Buffer.from(`${payload}.${createHmac("sha256", placeholder!).update(payload).digest("hex")}`).toString("base64url");
    expect(verifyExportToken(forged, "user-123")).toBe(false);
  });

  it("valida senha correta com sucesso", async () => {
    const result = await verifyUserPassword("user-123", "minha-senha-secreta");
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("falha com senha incorreta e registra tentativa", async () => {
    const result = await verifyUserPassword("user-123", "senha-errada");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Senha incorreta.");
  });

  it("bloqueia por rate limit após 5 tentativas de senha incorreta", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await verifyUserPassword("user-123", "senha-errada");
      expect(res.ok).toBe(false);
    }
    const blocked = await verifyUserPassword("user-123", "minha-senha-secreta");
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("Muitas tentativas");
  });

  it("reauthenticateForExport emite token após validação de senha", async () => {
    const res = await reauthenticateForExport("user-123", "minha-senha-secreta");
    expect(res.ok).toBe(true);
    expect(res.token).toBeDefined();
    expect(verifyExportToken(res.token!, "user-123")).toBe(true);
  });
});
