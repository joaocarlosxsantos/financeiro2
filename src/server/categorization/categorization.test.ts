import { describe, expect, it, vi } from "vitest";
import { categorizeBatch, categorizeDeterministic, type CategorizationCategory } from "./index";
import { normalizeDescription } from "./normalize";

const categories: CategorizationCategory[] = [
  { id: "salary", name: "Salário", kind: "INCOME", nature: "FIXED", keywords: ["salario", "folha"] },
  { id: "extra", name: "Renda extra", kind: "INCOME", nature: "VARIABLE", keywords: ["pix recebido", "estorno"] },
  { id: "earnings", name: "Rendimentos", kind: "INCOME", nature: "VARIABLE", keywords: ["rendimento", "dividendo"] },
  { id: "home", name: "Contas de casa", kind: "EXPENSE", nature: "FIXED", keywords: ["enel", "debito automatico"] },
  { id: "debt", name: "Dívidas e juros", kind: "EXPENSE", nature: "FIXED", keywords: ["iof", "juros"] },
  { id: "health", name: "Saúde", kind: "EXPENSE", nature: "FIXED", keywords: ["drogasil", "farmacia"] },
  { id: "subscriptions", name: "Assinaturas", kind: "EXPENSE", nature: "FIXED", keywords: ["netflix", "spotify"] },
  { id: "market", name: "Mercado", kind: "EXPENSE", nature: "VARIABLE", keywords: ["carrefour", "atacadao"] },
  { id: "dining", name: "Alimentação fora", kind: "EXPENSE", nature: "VARIABLE", keywords: ["ifood", "restaurante"] },
  { id: "transport", name: "Transporte", kind: "EXPENSE", nature: "VARIABLE", keywords: ["uber", "posto"] },
  { id: "shopping", name: "Compras", kind: "EXPENSE", nature: "VARIABLE", keywords: ["amazon", "shopee"] },
  { id: "other", name: "Outros", kind: "EXPENSE", nature: "VARIABLE", keywords: [] },
];

describe("pure categorization pipeline", () => {
  it("normalizes Itaú/acquirer prefixes, dates, installments and city suffixes", () => {
    expect(normalizeDescription("IFD*PIZZARIA DO ZE SAO PAULO BRA 01/03").key).toBe("IFOOD PIZZARIA DO ZE");
    expect(normalizeDescription("COMPRA CARTAO 14/10/2026 DROGASIL BARUERI BR PARC 02/12").key).toBe("COMPRA CARTAO DROGASIL");
    expect(normalizeDescription("DEB AUT ENEL").key).toBe("DEBITO AUTOMATICO ENEL");
    expect(normalizeDescription("PAGAMENTO BOLETO SABESP").key).toBe("BOLETO SABESP");
  });

  it("applies exact income, own-account transfer and card-payment suggestion rules", () => {
    expect(categorizeDeterministic({ description: "SALARIO EMPRESA", kind: "INCOME" }, categories).categoryId).toBe("salary");
    expect(categorizeDeterministic({ description: "REND PAGO APLICACAO CDB", kind: "INCOME" }, categories).categoryId).toBe("earnings");
    expect(categorizeDeterministic({ description: "PIX RECEBIDO - TERCEIRO", kind: "INCOME" }, categories).categoryId).toBe("extra");
    expect(categorizeDeterministic({ description: "PIX TRANSF JOAO SILVA", kind: "EXPENSE" }, categories, new Map(), ["Joao Silva"]))
      .toMatchObject({ categoryId: null, isTransfer: true, layer: "rule" });
    expect(categorizeDeterministic({ description: "PAGTO CARTAO ITAU", kind: "EXPENSE" }, categories))
      .toMatchObject({ categoryId: null, isTransfer: false, suggestIsCardPayment: true });
  });

  it("uses MCC and the Brazilian merchant dictionary for known merchants", () => {
    expect(categorizeDeterministic({ description: "IFD*PIZZARIA", kind: "EXPENSE" }, categories).categoryId).toBe("dining");
    expect(categorizeDeterministic({ description: "LOJA SEM NOME", kind: "EXPENSE", payeeMCC: 5411 }, categories).categoryId).toBe("market");
    expect(categorizeDeterministic({ description: "MP*DROGASIL", kind: "EXPENSE" }, categories).categoryId).toBe("health");
  });

  it("prioritizes a user's correction over exact rules, dictionary, and AI", async () => {
    const description = "IOF NETFLIX";
    const key = normalizeDescription(description).key;
    const userRules = new Map([[key, "market"]]);
    const provider = { categorize: vi.fn(async () => [{ categoryKey: "subscriptions", confidence: 0.99 }]) };
    const result = await categorizeBatch([{ description, kind: "EXPENSE" }], { categories, userRules, provider });
    expect(result.results[0]).toMatchObject({ categoryId: "market", layer: "user" });
    expect(provider.categorize).not.toHaveBeenCalled();
  });

  it("prioritizes exact rules over the dictionary and dictionary over AI", async () => {
    const rule = await categorizeBatch([{ description: "IOF NETFLIX", kind: "EXPENSE" }], {
      categories,
      provider: { categorize: vi.fn(async () => [{ categoryKey: "subscriptions", confidence: 0.99 }]) },
    });
    expect(rule.results[0]).toMatchObject({ categoryId: "debt", layer: "rule" });
    const dictionary = await categorizeBatch([{ description: "NETFLIX.COM", kind: "EXPENSE" }], {
      categories,
      provider: { categorize: vi.fn(async () => [{ categoryKey: "shopping", confidence: 0.99 }]) },
    });
    expect(dictionary.results[0]).toMatchObject({ categoryId: "subscriptions", layer: "dictionary" });
  });

  it("sends only sanitized normalized descriptions to the injectable provider", async () => {
    let providerInput: readonly string[] = [];
    const provider = { categorize: vi.fn(async (descriptions: readonly string[]) => { providerInput = descriptions; return [{ categoryKey: "other", confidence: 0.95 }]; }) };
    const result = await categorizeBatch([{
      description: "PIX ENVIADO Maria Souza CPF 123.456.789-00 CHAVE PIX maria.souza@example.com AG 1234 CONTA 987654321",
      kind: "EXPENSE",
    }], { categories, provider });
    const serialized = JSON.stringify(providerInput);
    expect(provider.categorize).toHaveBeenCalledTimes(1);
    expect(serialized).toBe('["PIX ENVIADO"]');
    expect(serialized).not.toMatch(/Maria|Souza|123|987654321|example|CONTA|AG/);
    expect(result.results[0]).toMatchObject({ categoryId: "other", layer: "provider" });
  });

  it("ignores low-confidence suggestions and reports per-layer counts", async () => {
    const result = await categorizeBatch([
      { description: "SPOTIFY", kind: "EXPENSE" },
      { description: "LOJA DESCONHECIDA", kind: "EXPENSE" },
    ], { categories, provider: { categorize: vi.fn(async () => [null, { categoryKey: "shopping", confidence: 0.2 }]) } });
    expect(result.results.map((row) => row.categoryId)).toEqual(["subscriptions", null]);
    expect(result.counts).toMatchObject({ dictionary: 1, none: 1, provider: 0 });
  });
});
