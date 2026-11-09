import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, secretFingerprint } from "./crypto";
import { amountToCents, hasPossibleCardPaymentMatch, isCardPayment, isCompatiblePluggyAccount, isSettled, linkOpenFinanceAccountSchema, periodExpenseCents, shouldImportPluggyTransaction, transactionKind } from "./schemas";

const priorKey = process.env.APP_ENCRYPTION_KEY;
afterEach(() => { if (priorKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = priorKey; });
function setKey() { process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); }

describe("Open Finance", () => {
  it("matches both item account types to the corresponding local account type", () => {
    expect(isCompatiblePluggyAccount("CHECKING", "BANK")).toBe(true);
    expect(isCompatiblePluggyAccount("CREDIT_CARD", "CREDIT")).toBe(true);
    expect(isCompatiblePluggyAccount("CHECKING", "CREDIT")).toBe(false);
    expect(isCompatiblePluggyAccount("CREDIT_CARD", "BANK")).toBe(false);
  });

  it("valida os campos do vínculo de conta em runtime", () => {
    const valid = { accountId: "a".repeat(26), connectionId: "b".repeat(26), externalAccountId: "external-123", mode: "integracao" as const };
    expect(linkOpenFinanceAccountSchema.safeParse(valid).success).toBe(true);
    expect(linkOpenFinanceAccountSchema.safeParse({ ...valid, accountId: "bad-id" }).success).toBe(false);
    expect(linkOpenFinanceAccountSchema.safeParse({ ...valid, connectionId: "" }).success).toBe(false);
    expect(linkOpenFinanceAccountSchema.safeParse({ ...valid, externalAccountId: "x".repeat(201) }).success).toBe(false);
    expect(linkOpenFinanceAccountSchema.safeParse({ ...valid, externalAccountId: null }).success).toBe(false);
    expect(linkOpenFinanceAccountSchema.safeParse({ ...valid, mode: "other" }).success).toBe(false);
    expect(linkOpenFinanceAccountSchema.safeParse({ ...valid, mode: "manual", externalAccountId: null }).success).toBe(true);
  });

  it("converte centavos com sinal, limite e moeda ausente", () => {
    expect(amountToCents(0)).toBe(0); expect(amountToCents(45.9)).toBe(4590);
    expect(amountToCents(-45.9)).toBe(-4590); expect(amountToCents(1.005)).toBe(101);
    expect(amountToCents(-1.005)).toBe(-101); expect(amountToCents(undefined)).toBeNull();
    expect(() => amountToCents(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => amountToCents(20_000_000.01)).toThrow();
  });

  it("mapeia sinais documentados para conta e cartão", () => {
    expect(transactionKind("BANK", "DEBIT")).toBe("EXPENSE");
    expect(transactionKind("BANK", "CREDIT")).toBe("INCOME");
    expect(transactionKind("CREDIT", "DEBIT")).toBe("EXPENSE");
    expect(transactionKind("CREDIT", "CREDIT")).toBe("INCOME");
    expect(isCardPayment("CREDIT", { type: "CREDIT", operationType: "PAGAMENTO_FATURA" })).toBe(true);
    expect(isCardPayment("BANK", { type: "DEBIT", operationType: "PAGAMENTO_FATURA" })).toBe(false);
    expect(shouldImportPluggyTransaction("CREDIT", { type: "CREDIT", operationType: "PAGAMENTO_FATURA" })).toBe(false);
    expect(shouldImportPluggyTransaction("BANK", { type: "DEBIT" })).toBe(true);
  });

  it("mantém PENDING fora de liquidados", () => {
    expect(isSettled("POSTED")).toBe(true); expect(isSettled("PENDING")).toBe(false);
  });

  it("compra em um mês e pagamento em outro não duplica despesa nos regimes cash/accrual", () => {
    const rows = [
      { month: "2026-01", kind: "EXPENSE" as const, amountCents: 10000, isCard: true, isCardPayment: false },
      { month: "2026-02", kind: "EXPENSE" as const, amountCents: 10000, isCard: false, isCardPayment: true },
    ];
    expect(periodExpenseCents(rows, "2026-01", "accrual")).toBe(10000);
    expect(periodExpenseCents(rows, "2026-01", "cash")).toBe(0);
    expect(periodExpenseCents(rows, "2026-02", "cash")).toBe(10000);
    expect(periodExpenseCents(rows, "2026-02", "accrual")).toBe(0);
  });

  it("sugere só por valor exato no mesmo mês, sem tocar em qualquer linha", () => {
    const purchase = [{ invoiceRef: "2026-01", totalAmountCents: 10000 }];
    expect(hasPossibleCardPaymentMatch({ date: "2026-01-27", amountCents: 10000, origin: "PLUGGY", isCardPayment: false }, purchase)).toBe(true);
    expect(hasPossibleCardPaymentMatch({ date: "2026-01-27", amountCents: 10000, origin: "CSV", isCardPayment: false }, purchase)).toBe(true);
    expect(hasPossibleCardPaymentMatch({ date: "2026-02-27", amountCents: 10000, origin: "PLUGGY", isCardPayment: false }, purchase)).toBe(false);
    expect(hasPossibleCardPaymentMatch({ date: "2026-01-27", amountCents: 10001, origin: "PLUGGY", isCardPayment: false }, purchase)).toBe(false);
    expect(hasPossibleCardPaymentMatch({ date: "2026-01-27", amountCents: 10000, origin: "PLUGGY", isCardPayment: true }, purchase)).toBe(false);
    expect(hasPossibleCardPaymentMatch({ date: "2026-01-27", amountCents: 10000, origin: "MANUAL", isCardPayment: false }, purchase)).toBe(false);
  });

  it("cifra com AAD, random IV e falha para adulteração/chave errada", () => {
    setKey();
    const envelope = encryptSecret("sensitive", "user-a", "clientSecret");
    expect(decryptSecret(envelope, "user-a", "clientSecret")).toBe("sensitive");
    expect(() => decryptSecret(envelope, "user-b", "clientSecret")).toThrow();
    expect(() => decryptSecret(`${envelope.slice(0, -2)}xx`, "user-a", "clientSecret")).toThrow();
    expect(encryptSecret("sensitive", "user-a", "clientSecret")).not.toBe(envelope);
    expect(secretFingerprint("item")).toBe(secretFingerprint("item"));
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    expect(() => decryptSecret(envelope, "user-a", "clientSecret")).toThrow();
    process.env.APP_ENCRYPTION_KEY = "invalida";
    expect(() => encryptSecret("x", "user-a", "clientSecret")).toThrow();
  });
});
