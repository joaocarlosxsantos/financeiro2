import { describe, it, expect } from "vitest";
import { checkRateLimit, clearFailures, isRateLimited, recordFailure, WINDOW_MS } from "./rate-limit";

describe("rate limit", () => {
  it("bloqueia a 6ª tentativa e libera depois da janela", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(checkRateLimit("a", 5, t0).allowed).toBe(true);
    const blocked = checkRateLimit("a", 5, t0 + 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkRateLimit("a", 5, t0 + WINDOW_MS).allowed).toBe(true);
  });

  it("login: só falhas contam, consultar não conta e sucesso zera", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 10; i++) expect(isRateLimited("b", 5, t0).allowed).toBe(true);
    for (let i = 0; i < 4; i++) recordFailure("b", t0);
    expect(isRateLimited("b", 5, t0).allowed).toBe(true);
    recordFailure("b", t0);
    expect(isRateLimited("b", 5, t0).allowed).toBe(false);
    clearFailures("b");
    expect(isRateLimited("b", 5, t0).allowed).toBe(true);
  });

  it("falhas expiram com a janela", () => {
    const t0 = 9_000_000;
    for (let i = 0; i < 5; i++) recordFailure("c", t0);
    expect(isRateLimited("c", 5, t0 + 1).allowed).toBe(false);
    expect(isRateLimited("c", 5, t0 + WINDOW_MS).allowed).toBe(true);
  });
});
