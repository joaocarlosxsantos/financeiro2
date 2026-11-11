import { describe, expect, it } from "vitest";
import {
  calculateCategorySuggestion,
  getCategoryHistoryWindow,
  aggregateMonthlyExpensesByCategory,
  type TransactionForSuggestion,
} from "./budget-suggestions";
import type { MonthRef } from "./dates";

describe("calculateCategorySuggestion", () => {
  it("uses the median for 3 closed months to eliminate outliers", () => {
    // Mês 1: R$ 300, Mês 2: R$ 350, Mês 3 (pico atípico): R$ 1.500
    // Mediana = R$ 350 -> arredondado para R$ 350 (35000 centavos)
    const res = calculateCategorySuggestion([30000, 35000, 150000]);
    expect(res.suggestedCents).toBe(35000);
    expect(res.monthsCount).toBe(3);
    expect(res.label).toBe("média 3m");
  });

  it("calculates the average when only 2 closed months exist", () => {
    // Mês 1: R$ 200, Mês 2: R$ 250 -> Média: R$ 225 -> arredondado: R$ 230 (23000 centavos)
    const res = calculateCategorySuggestion([20000, 25000]);
    expect(res.suggestedCents).toBe(23000);
    expect(res.monthsCount).toBe(2);
    expect(res.label).toBe("média 2m");
  });

  it("uses the single month value when only 1 closed month exists", () => {
    // Mês 1: R$ 184 -> arredondado para dezenas: R$ 180 (18000 centavos)
    const res = calculateCategorySuggestion([18400]);
    expect(res.suggestedCents).toBe(18000);
    expect(res.monthsCount).toBe(1);
    expect(res.label).toBe("média 1m");
  });

  it("handles new categories with no history or empty array", () => {
    const res = calculateCategorySuggestion([]);
    expect(res.suggestedCents).toBe(0);
    expect(res.monthsCount).toBe(0);
    expect(res.label).toBe("sem histórico");
  });

  it("handles categories where all months had zero expenses", () => {
    const res = calculateCategorySuggestion([0, 0, 0]);
    expect(res.suggestedCents).toBe(0);
    expect(res.monthsCount).toBe(3);
    expect(res.label).toBe("sem histórico");
  });

  it("enforces a minimum suggested amount of R$ 10 for small non-zero values", () => {
    // R$ 3,50 gasto -> arredonda para mínimo de R$ 10 (1000 centavos)
    const res = calculateCategorySuggestion([350]);
    expect(res.suggestedCents).toBe(1000);
  });

  describe("getCategoryHistoryWindow", () => {
    it("returns 3 months when oldest month has expenses", () => {
      expect(getCategoryHistoryWindow([30000, 35000, 150000])).toEqual([30000, 35000, 150000]);
    });

    it("returns 2 months when oldest month had zero expenses (2 months of history)", () => {
      expect(getCategoryHistoryWindow([20000, 25000, 0])).toEqual([20000, 25000]);
    });

    it("returns 1 month for a new category that only had expenses in the last month", () => {
      expect(getCategoryHistoryWindow([18400, 0, 0])).toEqual([18400]);
    });

    it("returns [0, 0, 0] when all months had zero expenses", () => {
      expect(getCategoryHistoryWindow([0, 0, 0])).toEqual([0, 0, 0]);
    });
  });
});

describe("aggregateMonthlyExpensesByCategory", () => {
  const months: MonthRef[] = [
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ];

  it("excludes transfers and card invoice payments to avoid duplicate expenses", () => {
    const txs: TransactionForSuggestion[] = [
      {
        categoryId: "cat_food",
        amountCents: 50000,
        kind: "EXPENSE",
        isTransfer: false,
        isCardPayment: false,
        date: "2026-08-15T12:00:00Z",
      },
      // Transferência (deve ser ignorada)
      {
        categoryId: "cat_food",
        amountCents: 40000,
        kind: "EXPENSE",
        isTransfer: true,
        isCardPayment: false,
        date: "2026-08-16T12:00:00Z",
      },
      // Pagamento de fatura de cartão (deve ser ignorado)
      {
        categoryId: "cat_food",
        amountCents: 90000,
        kind: "EXPENSE",
        isTransfer: false,
        isCardPayment: true,
        date: "2026-08-17T12:00:00Z",
      },
      // Receita (deve ser ignorada)
      {
        categoryId: "cat_food",
        amountCents: 100000,
        kind: "INCOME",
        isTransfer: false,
        isCardPayment: false,
        date: "2026-08-18T12:00:00Z",
      },
    ];

    const aggregated = aggregateMonthlyExpensesByCategory(txs, months);
    const foodHistory = aggregated.get("cat_food");
    expect(foodHistory).toEqual([50000, 0, 0]);
  });

  it("places card installments in their corrected date / competence month", () => {
    // Parcela de cartão com data corrigida para o mês da fatura (outubro/2026)
    const txs: TransactionForSuggestion[] = [
      {
        categoryId: "cat_elec",
        amountCents: 15000,
        kind: "EXPENSE",
        isTransfer: false,
        isCardPayment: false,
        date: "2026-10-05T12:00:00Z",
      },
      {
        categoryId: "cat_elec",
        amountCents: 15000,
        kind: "EXPENSE",
        isTransfer: false,
        isCardPayment: false,
        date: "2026-09-05T12:00:00Z",
      },
    ];

    const aggregated = aggregateMonthlyExpensesByCategory(txs, months);
    const elecHistory = aggregated.get("cat_elec");
    expect(elecHistory).toEqual([0, 15000, 15000]);
  });

  it("ignores transactions without category or with invalid date", () => {
    const txs: TransactionForSuggestion[] = [
      {
        categoryId: null,
        amountCents: 20000,
        kind: "EXPENSE",
        isTransfer: false,
        date: "2026-08-10T12:00:00Z",
      },
      {
        categoryId: "cat_valid",
        amountCents: 10000,
        kind: "EXPENSE",
        isTransfer: false,
        date: "invalid-date",
      },
    ];

    const aggregated = aggregateMonthlyExpensesByCategory(txs, months);
    expect(aggregated.has("cat_valid")).toBe(false);
  });
});
