import { describe, expect, it } from "vitest";
import { normalizeDescription } from "./normalize";
import { matchLearnedRule, buildRulesLookupMap } from "./learning";

describe("Categorization learning logic", () => {
  it("normalizes descriptions consistently for rule learning", () => {
    const raw1 = "IFOOD *RESTAURANTE XPTO 12/05";
    const raw2 = "IFOOD *RESTAURANTE XPTO 15/06";
    expect(normalizeDescription(raw1).key).toBe(normalizeDescription(raw2).key);
  });

  it("matches a learned user rule by normalized pattern", () => {
    const rulesMap = buildRulesLookupMap([
      {
        normalizedPattern: "IFOOD RESTAURANTE XPTO",
        categoryId: "cat_dining",
        kind: "EXPENSE",
        nature: "VARIABLE",
      },
      {
        normalizedPattern: "POSTO SHELL",
        categoryId: "cat_transport",
        kind: "EXPENSE",
        nature: "VARIABLE",
      },
    ]);

    const match1 = matchLearnedRule("IFOOD *RESTAURANTE XPTO 999", "EXPENSE", rulesMap);
    expect(match1).not.toBeNull();
    expect(match1?.categoryId).toBe("cat_dining");
    expect(match1?.nature).toBe("VARIABLE");

    const match2 = matchLearnedRule("POSTO SHELL 44", "EXPENSE", rulesMap);
    expect(match2?.categoryId).toBe("cat_transport");
  });

  it("does not match when kind does not match (e.g. INCOME vs EXPENSE)", () => {
    const rulesMap = buildRulesLookupMap([
      {
        normalizedPattern: "PIX RECEBIDO JOAO",
        categoryId: "cat_extra_income",
        kind: "INCOME",
        nature: null,
      },
    ]);

    // Tentando aplicar para despesa
    const match = matchLearnedRule("PIX RECEBIDO JOAO", "EXPENSE", rulesMap);
    expect(match).toBeNull();

    // Com o tipo correto bate
    const matchIncome = matchLearnedRule("PIX RECEBIDO JOAO", "INCOME", rulesMap);
    expect(matchIncome?.categoryId).toBe("cat_extra_income");
  });

  it("handles descriptions without matching rules gracefully", () => {
    const rulesMap = buildRulesLookupMap([]);
    const match = matchLearnedRule("SUPERMERCADO DESCONHECIDO", "EXPENSE", rulesMap);
    expect(match).toBeNull();
  });
});
