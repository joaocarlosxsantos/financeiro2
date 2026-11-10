import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import bcrypt from "bcryptjs";
import { issueExportToken } from "@/lib/reauth";
import { clearFailures } from "@/lib/rate-limit";

const mockUser = {
  id: "user-backup-route",
  name: "Usuário Teste",
  email: "teste@financeiro.local",
  passwordHash: bcrypt.hashSync("minha-senha-backup-123", 8),
};

vi.mock("@/lib/auth", () => ({
  requireUserId: async () => "user-backup-route",
}));

vi.mock("@/db", () => ({
  db: {
    select: () => {
      const builder = {
        from: () => builder,
        where: () => builder,
        innerJoin: () => builder,
        limit: async () => [mockUser],
        then: (resolve: (rows: unknown[]) => unknown, reject: (err: unknown) => unknown) => {
          return Promise.resolve([mockUser]).then(resolve, reject);
        },
      };
      return builder;
    },
  },
}));

vi.mock("@/lib/backup", () => ({
  buildBackup: (data: unknown) => ({ version: 1, mockBackup: true, data }),
}));

describe("API route /api/exportar/backup with reauthentication", () => {
  beforeEach(() => {
    clearFailures("reauth:user-backup-route");
  });

  it("GET sem senha nem token retorna 401 Reautenticação necessária", async () => {
    const req = new NextRequest("http://localhost:3000/api/exportar/backup");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Reautenticação necessária");
  });

  it("GET ignora senha passada em query string para evitar vazamento em logs", async () => {
    const req = new NextRequest("http://localhost:3000/api/exportar/backup?password=minha-senha-backup-123");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Reautenticação necessária");
  });

  it("GET com senha incorreta no header retorna 401 Senha incorreta", async () => {
    const req = new NextRequest("http://localhost:3000/api/exportar/backup", {
      headers: { "x-reauth-password": "senha-errada" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Senha incorreta.");
  });

  it("GET com token de exportação válido retorna 200 e arquivo de backup", async () => {
    const token = issueExportToken("user-backup-route", 60_000);
    const req = new NextRequest(`http://localhost:3000/api/exportar/backup?token=${token}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");
    const body = await res.json();
    expect(body.mockBackup).toBe(true);
  });

  it("POST com senha válida no body retorna 200 e o backup", async () => {
    const req = new NextRequest("http://localhost:3000/api/exportar/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "minha-senha-backup-123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mockBackup).toBe(true);
  });

  it("POST com token expirado ou de outro usuário retorna 401", async () => {
    const tokenOutro = issueExportToken("outro-usuario", 60_000);
    const req = new NextRequest("http://localhost:3000/api/exportar/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenOutro }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
