import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { BalancesOverview } from "@/server/queries";
import { InvestmentSummary } from "./investment-summary";

function balance(partial = false): BalancesOverview {
  return {
    accounts: [{ id: "investment", name: "CDB", type: "INVESTMENT", institution: null, color: "#000000", openingBalanceCents: 0, openingBalanceDate: null, incomeCents: 0, expenseCents: 0, balanceCents: 2000, transactionCount: 0, financeMode: "integracao", bankBalanceCents: partial ? null : 2000, bankBalanceAt: null }],
    availableCents: 1000, investedCents: 2000, netWorthCents: 4000, savedInGoalsCents: 1000, debtBalanceCents: 0, totalIncomplete: partial, needsOpeningBalance: false,
  };
}

it("identifica posição atual e participação sem apresentar o saldo como histórico", () => {
  const html = renderToStaticMarkup(createElement(InvestmentSummary, { balance: balance() }));
  expect(html).toContain("Investimentos hoje");
  expect(html).toContain("Disponível");
  expect(html).toContain("Investido");
  expect(html).toContain("Patrimônio líquido");
  expect(html).toContain("50% do patrimônio líquido");
  expect(html).toContain("Saldos atuais");
  expect(html).not.toMatch(/NaN|Infinity/);
});

it("indica posição parcial sem prometer participação completa", () => {
  const html = renderToStaticMarkup(createElement(InvestmentSummary, { balance: balance(true) }));
  expect(html).toContain("Investido (parcial)");
  expect(html).not.toContain("50%");
});

it("não cria seção vazia sem contas de investimento", () => {
  expect(renderToStaticMarkup(createElement(InvestmentSummary, { balance: { ...balance(), accounts: [] } }))).toBe("");
});
