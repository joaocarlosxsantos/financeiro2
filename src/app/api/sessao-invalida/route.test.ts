import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: mocks.signOut }));
import * as route from "./route";

beforeEach(() => vi.clearAllMocks());

it("não exporta GET que possa encerrar sessão por navegação ou prefetch", () => {
  expect(route).not.toHaveProperty("GET");
});

it.each([undefined, "null", "https://evil.test", "https://app.test.evil.test", "http://app.test"])("nega POST com origem ausente/externa: %s", async origin => {
  const response = await route.POST(new Request("https://app.test/api/sessao-invalida", {
    method: "POST", headers: origin ? { origin } : {},
  }));
  expect(response.status).toBe(403);
  expect(mocks.signOut).not.toHaveBeenCalled();
});

it("encerra sessão somente em POST da mesma origem e redireciona com GET", async () => {
  const response = await route.POST(new Request("https://app.test/api/sessao-invalida", {
    method: "POST", headers: { origin: "https://app.test" },
  }));
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ redirect: false });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://app.test/login?sessao=expirada");
});
