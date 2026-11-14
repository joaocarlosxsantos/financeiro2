import { describe, expect, it } from "vitest";
import { spendingForecast, type SpendingEntry } from "./spending-forecast";

const entry = (date: string, amountCents: number, extra: Partial<SpendingEntry> = {}): SpendingEntry => ({
  date, amountCents, kind: "EXPENSE", nature: "VARIABLE", description: "Mercado", category: "Alimentação",
  accountType: "CHECKING", isTransfer: false, isCardPayment: false, externalStatus: "POSTED",
  recurringRuleId: null, installmentGroupId: null, ...extra,
});
function history(today = "2026-11-14") {
  const time = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: 56 }, (_, i) => {
    const date = new Date(time - (56 - i) * 86_400_000);
    return entry(date.toISOString().slice(0, 10), date.getUTCDay() === 6 ? 10000 : 3000);
  });
}
const analyze = (entries: SpendingEntry[], extra = {}) => spendingForecast({ today: "2026-11-14", entries,
  commitments: [], expectedIncomeCents: 600000, ...extra });

describe("Previsão robusta do Telegram", () => {
  it("não extrapola aluguel, fatura, investimento, transferência e parcelas futuras como > R$1000/dia", () => {
    const entries = [...history(),
      entry("2026-11-01", 250000, { nature: "FIXED", recurringRuleId: "rent" }),
      entry("2026-11-02", 900000, { isCardPayment: true }),
      entry("2026-11-03", 2000000, { isTransfer: true }),
      entry("2026-11-04", 3000000, { accountType: "INVESTMENT" }),
      entry("2026-11-05", 700000), // One real exceptional purchase: keep its cost, don't repeat it.
      entry("2026-11-20", 50000, { installmentGroupId: "sofa" }),
    ];
    const result = analyze(entries);
    expect(result.weekdayCents).toEqual([3000, 3000, 3000, 3000, 3000, 3000, 10000]);
    expect(result.forecast.dailyAvgCents).toBe(4000);
    expect(result.committedCents).toBe(50000);
    const expense = 13 * 3000 + 10000 - 3000 + 250000 + 700000;
    // Nov 1-13 has one Saturday (Nov 7); 15-30 has two (21,28).
    expect(result.forecast.projectedExpenseCents).toBe(expense + 50000 + 14 * 3000 + 2 * 10000);
    expect(result.daily.remainingTodayCents).toBe(0);
  });

  it("pesa sábados e desconta compromissos antes do teto diário, sem subtrair hoje duas vezes", () => {
    const commitments = [{ date: "2026-11-20", kind: "EXPENSE", amountCents: 100000, name: "Aluguel" }];
    const result = analyze([...history(), entry("2026-11-14", 2000)], { commitments });
    const beforeToday = 12 * 3000 + 10000;
    const pool = 600000 - beforeToday - 100000;
    const weights = 14 * 3000 + 3 * 10000;
    expect(result.daily.dailyAllowanceCents).toBe(Math.floor(pool * 10000 / weights));
    expect(result.daily.remainingTodayCents).toBe(result.daily.dailyAllowanceCents - 2000);
    expect(result.daily.availableForRestOfMonthCents).toBe(pool - 2000);
  });

  it("mantém dias sem gasto no histórico e elimina pico isolado", () => {
    const entries = history().map(r => ({ ...r, amountCents: 0 }));
    entries[10].amountCents = 1000000;
    expect(analyze(entries).weekdayCents).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(analyze(entries).forecast.projectedExpenseCents).toBe(0); // Outlier happened in September.
  });

  it("não soma renda cadastrada à recebida/agendada e não conta pendente como realizado", () => {
    const result = analyze([entry("2026-11-01", 400000, { kind: "INCOME" }),
      entry("2026-11-20", 200000, { kind: "INCOME" }),
      entry("2026-11-10", 50000, { externalStatus: "PENDING", nature: "FIXED" }),
      entry("2026-11-12", 999999, { externalStatus: "CANCELLED" })]);
    expect(result.committedCents).toBe(50000);
    expect(result.forecast.projectedBalanceCents).toBe(550000);
  });

  it("substitui o padrão variável somente no dia de uma compra já agendada", () => {
    const baseline = analyze(history());
    const planned = analyze([...history(), entry("2026-11-16", 10000)]);
    expect(planned.forecast.projectedExpenseCents - baseline.forecast.projectedExpenseCents).toBe(7000);
  });

  it("gera comparações, categorias, atípico, ritmo, recorrentes e sobra/falta com texto curto", () => {
    const result = analyze([...history(), entry("2026-11-13", 50000, { description: "Dentista", category: "Saúde" })], {
      commitments: [{ date: "2026-11-18", kind: "EXPENSE", name: "Internet", amountCents: 12000 }],
    });
    const text = result.insights.join("\n");
    for (const term of ["semana passada", "padrão de sexta", "Mês vs anterior", "Saúde", "Dentista", "Ritmo", "Dia mais caro", "Internet", "sobra"]) expect(text).toContain(term);
    expect(result.insights.every(s => s.length < 250)).toBe(true);
  });

  it("suporta histórico vazio, ano novo, último dia e fevereiro bissexto", () => {
    expect(analyze([]).historyDays).toBe(0);
    const result = analyze([], { today: "2028-02-29", commitments: [] });
    expect(result.forecast.daysRemaining).toBe(0);
    expect(result.daily.remainingTodayCents).toBe(600000);
    expect(analyze(history("2027-01-01"), { today: "2027-01-01" }).forecast.daysRemaining).toBe(30);
  });
  it("não transforma uma primeira compra isolada em padrão diário com histórico curto", () => {
    expect(analyze([entry("2026-11-13", 1000000)]).forecast.dailyAvgCents).toBe(0);
  });
  it("remove dois picos isolados no mesmo dia da semana em oito semanas", () => {
    const entries = history();
    entries[10].amountCents = 1000000;
    entries[17].amountCents = 2000000;
    expect(analyze(entries).weekdayCents).toEqual([3000, 3000, 3000, 3000, 3000, 3000, 10000]);
  });
  it("compara ritmo ao orçamento da categoria antes de atingir 80%", () => {
    const result = analyze(history(), { budgets: [{ category: "Alimentação", limitCents: 50000 }] });
    expect(result.insights.join("\n")).toContain("Ritmo acima do orçamento em Alimentação");
  });
});
