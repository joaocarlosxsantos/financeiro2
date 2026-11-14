import { describe, expect, it } from "vitest";
import { safeNotificationPath } from "./notification-links";

describe("safeNotificationPath", () => {
  it("keeps safe internal paths with query and hash", () => {
    expect(safeNotificationPath("/contas?aba=cartao#fatura", "https://financeiro.test")).toBe("/contas?aba=cartao#fatura");
  });

  it.each(["https://example.com/roubo", "//example.com/roubo", "javascript:alert(1)", "not-a-path"]) (
    "falls back for unsafe destination %s", value => {
      expect(safeNotificationPath(value, "https://financeiro.test")).toBe("/notificacoes");
    },
  );
});
