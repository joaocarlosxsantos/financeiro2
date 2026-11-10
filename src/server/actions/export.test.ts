import { describe, expect, it, vi, beforeEach } from "vitest";
import { confirmPasswordForExportAction, requestExportToken, verifyPasswordAction } from "./export";
import bcrypt from "bcryptjs";
import { clearFailures } from "@/lib/rate-limit";

const mockUser = {
  id: "user-export-test",
  passwordHash: bcrypt.hashSync("senha-valida-123", 8),
};

vi.mock("@/lib/auth", () => ({
  requireUserId: async () => "user-export-test",
}));

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

describe("server actions for export reauthentication", () => {
  beforeEach(() => {
    clearFailures("reauth:user-export-test");
  });

  it("verifyPasswordAction valida a senha corretamente", async () => {
    const ok = await verifyPasswordAction("senha-valida-123");
    expect(ok.ok).toBe(true);

    const fail = await verifyPasswordAction("senha-incorreta");
    expect(fail.ok).toBe(false);
    expect(fail.error).toBe("Senha incorreta.");
  });

  it("requestExportToken retorna token assinado com senha válida", async () => {
    const res = await requestExportToken("senha-valida-123");
    expect(res.ok).toBe(true);
    expect(res.token).toBeDefined();
    expect(typeof res.token).toBe("string");
  });

  it("requestExportToken recusa senha incorreta", async () => {
    const res = await requestExportToken("senha-errada");
    expect(res.ok).toBe(false);
    expect(res.token).toBeUndefined();
    expect(res.error).toBe("Senha incorreta.");
  });

  it("confirmPasswordForExportAction aceita FormData com senha correta", async () => {
    const fd = new FormData();
    fd.set("password", "senha-valida-123");
    const res = await confirmPasswordForExportAction({}, fd);
    expect(res.ok).toBe(true);
    expect(res.token).toBeDefined();
  });
});
