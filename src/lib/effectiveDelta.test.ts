import { describe, it, expect } from "vitest";
import { effectiveDelta } from "./effectiveDelta";

describe("effectiveDelta", () => {
  it("aporte normal: saldo 100, delta +50 → 50", () => {
    expect(effectiveDelta(100, 50)).toBe(50);
  });

  it("resgate maior que saldo: saldo 100, delta -150 → -100 (deixa saldo em 0)", () => {
    expect(effectiveDelta(100, -150)).toBe(-100);
  });

  it("saldo zero, resgate: saldo 0, delta -50 → 0 (não muda)", () => {
    expect(effectiveDelta(0, -50)).toBe(0);
  });

  it("saldo zero, aporte: saldo 0, delta +50 → 50", () => {
    expect(effectiveDelta(0, 50)).toBe(50);
  });

  it("exato: saldo 100, delta -100 → -100", () => {
    expect(effectiveDelta(100, -100)).toBe(-100);
  });
});
