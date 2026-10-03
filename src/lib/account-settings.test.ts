import { describe, expect, it } from "vitest";
import { accountSchema } from "./account-schema";

describe("accountSchema (Zod validation)", () => {
  it("aceita closingDay e dueDay válidos entre 1 e 31", () => {
    const res = accountSchema.safeParse({
      name: "Nubank",
      type: "CREDIT_CARD",
      closingDay: 25,
      dueDay: 5,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.closingDay).toBe(25);
    expect(res.data.dueDay).toBe(5);
  });

  it("aceita closingDay e dueDay como strings numéricas vindas de FormData", () => {
    const res = accountSchema.safeParse({
      name: "Nubank",
      type: "CREDIT_CARD",
      closingDay: "1",
      dueDay: "31",
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.closingDay).toBe(1);
    expect(res.data.dueDay).toBe(31);
  });

  it("converte string vazia, null ou undefined em null", () => {
    const res1 = accountSchema.safeParse({
      name: "Conta Corrente",
      type: "CHECKING",
      closingDay: "",
      dueDay: null,
    });
    expect(res1.success).toBe(true);
    if (!res1.success) return;
    expect(res1.data.closingDay).toBeNull();
    expect(res1.data.dueDay).toBeNull();

    const res2 = accountSchema.safeParse({
      name: "Conta Corrente",
      type: "CHECKING",
    });
    expect(res2.success).toBe(true);
    if (!res2.success) return;
    expect(res2.data.closingDay).toBeNull();
    expect(res2.data.dueDay).toBeNull();
  });

  it("rejeita dia menor que 1", () => {
    const res = accountSchema.safeParse({
      name: "Nubank",
      type: "CREDIT_CARD",
      closingDay: 0,
      dueDay: 5,
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues[0]?.message).toMatch(/entre 1 e 31/);
  });

  it("rejeita dia maior que 31", () => {
    const res = accountSchema.safeParse({
      name: "Nubank",
      type: "CREDIT_CARD",
      closingDay: 25,
      dueDay: 32,
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues[0]?.message).toMatch(/entre 1 e 31/);
  });

  it("rejeita dia não inteiro (float)", () => {
    const res = accountSchema.safeParse({
      name: "Nubank",
      type: "CREDIT_CARD",
      closingDay: 15.5,
      dueDay: 5,
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues[0]?.message).toMatch(/número inteiro/);
  });

  it("rejeita strings não numéricas", () => {
    const res = accountSchema.safeParse({
      name: "Nubank",
      type: "CREDIT_CARD",
      closingDay: "abc",
      dueDay: 5,
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues[0]?.message).toMatch(/entre 1 e 31/);
  });
});
