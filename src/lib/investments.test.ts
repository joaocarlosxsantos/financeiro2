import { describe, expect, it } from "vitest";
import { investmentMovementLabel, investmentPosition, projectionOpeningCents } from "./investments";

const balance = { investedCents: 30000, netWorthCents: 100000, totalIncomplete: false, accounts: [{ type: "INVESTMENT", financeMode: "integracao", bankBalanceCents: 30000 }] };

describe("posição dos investimentos", () => {
  it("calcula participação sem somar novamente ao patrimônio", () => {
    expect(investmentPosition(balance)).toEqual({ hasInvestments: true, incomplete: false, sharePct: 30 });
    expect(projectionOpeningCents(balance, 5000)).toBe(30000);
  });
  it("não apresenta saldo parcial como zero definitivo nem como participação completa", () => {
    const missing = { ...balance, totalIncomplete: true, accounts: [{ ...balance.accounts[0], bankBalanceCents: null }] };
    expect(investmentPosition(missing)).toEqual({ hasInvestments: true, incomplete: true, sharePct: null });
    expect(projectionOpeningCents(missing, 5000)).toBe(5000);
  });
  it("preserva a simulação com metas sem contas de investimento e reconhece saldo investido zero", () => {
    expect(projectionOpeningCents({ ...balance, accounts: [] }, 5000)).toBe(5000);
    expect(projectionOpeningCents({ ...balance, investedCents: 0 }, 5000)).toBe(0);
    expect(investmentPosition({ ...balance, netWorthCents: -1 }).sharePct).toBeNull();
    expect(investmentPosition({ ...balance, netWorthCents: 10000 }).sharePct).toBeNull();
  });
});

describe("rótulos de investimentos Pluggy", () => {
  const row = { accountType: "INVESTMENT", origin: "PLUGGY", isTransfer: true, kind: "INCOME", description: "Aplicação · CDB" };
  it("distingue aplicação, resgate e imposto sem classificar outras despesas como imposto", () => {
    expect(investmentMovementLabel(row)).toBe("Aplicação");
    expect(investmentMovementLabel({ ...row, kind: "EXPENSE", description: "Resgate · CDB" })).toBe("Resgate");
    expect(investmentMovementLabel({ ...row, description: "Transferência · CDB" })).toBeNull();
    expect(investmentMovementLabel({ ...row, kind: "EXPENSE", isTransfer: false, description: "Imposto · CDB" })).toBe("Imposto");
    expect(investmentMovementLabel({ ...row, kind: "EXPENSE", isTransfer: false, description: "Taxa" })).toBeNull();
    expect(investmentMovementLabel({ ...row, accountType: "CHECKING" })).toBeNull();
    expect(investmentMovementLabel({ ...row, origin: "MANUAL" })).toBeNull();
  });
});
