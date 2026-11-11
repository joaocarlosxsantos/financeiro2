import { beforeEach, expect, it, vi } from "vitest";
import { addMonthsKeepingDay } from "@/lib/installments";
import { invoiceCycle, invoiceRefForInstallment } from "@/lib/invoices";
import { getCardCategoryBreakdown, getTransactions } from "./queries";
import { loadCardSummary } from "./telegram/card-summary";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle((...args) => query(...args)) };
});

const originalDate = new Date("2026-09-30T12:00:00Z");
const firstRef = invoiceCycle(originalDate, 20, 28).ref;
const purchases = [
  ...[1, 2, 3].map((number) => ({
    description: `Loja (${number}/3)`,
    date: addMonthsKeepingDay(originalDate, number - 1),
    invoiceRef: invoiceRefForInstallment(firstRef, number),
    installmentNumber: number,
  })),
  {
    description: "Mercado",
    date: new Date("2026-11-05T12:00:00Z"),
    invoiceRef: "2026-11",
    installmentNumber: null,
  },
  {
    description: "Compra futura",
    date: new Date("2026-11-11T12:00:00Z"),
    invoiceRef: "2026-11",
    installmentNumber: null,
  },
];

beforeEach(() => {
  query.mockReset();
});

it("lista a fatura de novembro a partir de 30/10, em ordem de data da parcela", async () => {
  query.mockImplementation(async (statement: string, params: unknown[]) => {
    const rows = statement.includes('"transactions"."invoice_ref" =')
      ? purchases.filter((purchase) => purchase.invoiceRef === params.find((param) => param === "2026-11"))
      : purchases.filter((purchase) => purchase.date.getUTCMonth() === 10);
    const direction = statement.includes('"transactions"."date" asc') ? 1 : -1;
    return {
      rows: rows.sort((a, b) => direction * (a.date.getTime() - b.date.getTime()))
        .map((purchase) => [purchase.description, purchase.date.toISOString(), purchase.description]),
    };
  });

  const rows = await getTransactions("owner", { ref: { year: 2026, month: 11 }, accountKind: "CARD" });
  expect(rows.map((row) => row.description)).toEqual(["Loja (2/3)", "Mercado", "Compra futura"]);
  expect(query.mock.calls[0][0]).toMatch(/order by "transactions"\."date" asc,.*"transactions"\."id" asc/);
});

it("usa o mesmo mês de fatura no painel de cartão", async () => {
  query.mockResolvedValue({ rows: [] });
  await getCardCategoryBreakdown("owner", { year: 2026, month: 11 });
  expect(query.mock.calls[0][0]).toContain('"transactions"."invoice_ref" =');
  expect(query.mock.calls[0][1]).toContain("2026-11");
});

it("usa a fatura no filtro mensal de um cartão e mantém datas no período explícito", async () => {
  const ref = { year: 2026, month: 11 };
  query.mockResolvedValueOnce({ rows: [["CREDIT_CARD"]] }).mockResolvedValue({ rows: [] });
  await getTransactions("owner", { ref, accountId: "card" });
  expect(query.mock.calls[0][1]).toEqual(["owner", "card", 1]);
  expect(query.mock.calls[1][0]).toContain('"transactions"."invoice_ref" =');
  expect(query.mock.calls[1][0]).toContain('"transactions"."date" asc');

  await getTransactions("owner", { ref, accountId: "card", dateFrom: "2026-11-01", dateTo: "2026-11-10" });
  expect(query).toHaveBeenCalledTimes(3);
  expect(query.mock.calls[2][0]).not.toContain('"transactions"."invoice_ref" =');
  expect(query.mock.calls[2][0]).toContain('"transactions"."date" desc');
});

it("o /cartao mostra só compras ocorridas, incluindo a 1ª parcela na data da compra", async () => {
  query.mockImplementation(async (statement: string, params: unknown[]) => {
    if (statement.includes('from "accounts"')) {
      return { rows: [["card", "Meu cartão", 20, 28, 50000, null]] };
    }
    if (statement.includes('from "open_finance_invoices"')) return { rows: [[15000]] };
    let rows = [...purchases, {
      description: "Compra do dia",
      date: new Date("2026-11-10T23:59:59Z"),
      invoiceRef: "2026-11",
      installmentNumber: null,
    }];
    if (statement.includes('"transactions"."installment_number" is null')) {
      rows = rows.filter(({ installmentNumber }) => installmentNumber === null || installmentNumber === 1);
    }
    const cutoff = params.find((param) => typeof param === "string" && param.startsWith("2026-11-11T"));
    if (typeof cutoff === "string") rows = rows.filter(({ date }) => date < new Date(cutoff));
    return {
      rows: rows.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5)
        .map(({ description, date }) => [description, 5000, date.toISOString()]),
    };
  });

  const result = await loadCardSummary("owner", undefined, new Date("2026-11-11T02:30:00Z"));
  expect(result.match(/^  - .*$/gm)?.map((line) => line.split(":")[0]))
    .toEqual(["  - 10/11 Compra do dia", "  - 05/11 Mercado", "  - 30/09 Loja (1/3)"]);
  expect(result).toContain("150,00");
  expect(result).toContain("350,00");
  expect(query.mock.calls.at(-1)?.[0]).toMatch(/order by "transactions"\."date" desc,.*"transactions"\."id" desc limit/);
});
