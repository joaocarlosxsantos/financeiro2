import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveImportDate } from "./import-dates";
import { invoiceForPurchase, invoiceLabel } from "./invoices";

const C = 30; // fecha dia 30
const V = 7; // vence dia 7 do mês seguinte — o cartão do próprio usuário

test("lançamentos gerais: parcela 1 fica como veio, sem ajuste", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "AMAZON 1/12", {
    importKind: "GENERAL",
    isCard: true,
    closingDay: C,
    dueDay: V,
  });
  assert.equal(r.adjusted, false);
  assert.equal(r.date.getTime(), compra.getTime());
  assert.deepEqual(r.marker, { number: 1, total: 12 });
});

test("lançamentos gerais: parcela 2/12 avança um mês a partir da compra original", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "AMAZON 2/12", {
    importKind: "GENERAL",
    isCard: true,
    closingDay: C,
    dueDay: V,
  });
  assert.equal(r.adjusted, true);
  assert.equal(r.matched, true);
  assert.equal(r.date.getUTCFullYear(), 2026);
  assert.equal(r.date.getUTCMonth() + 1, 8); // agosto
  assert.equal(r.date.getUTCDate(), 17);
  // a fatura calculada para a parcela 1 (compra pura) e a da parcela 2 (ajustada)
  // têm que ficar exatamente um mês de distância uma da outra
  const invoice1 = invoiceForPurchase(compra, C, V);
  const invoice2 = invoiceForPurchase(r.date, C, V);
  assert.equal(invoice2.year * 12 + invoice2.month, invoice1.year * 12 + invoice1.month + 1);
});

test("lançamentos gerais: parcela em conta que não é cartão não é mexida", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "ALGO 2/12", {
    importKind: "GENERAL",
    isCard: false,
    closingDay: C,
    dueDay: V,
  });
  assert.equal(r.adjusted, false);
  assert.equal(r.date.getTime(), compra.getTime());
});

test("lançamentos gerais: sem marcador de parcela, data não muda", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "IFOOD LANCHONETE", {
    importKind: "GENERAL",
    isCard: true,
    closingDay: C,
    dueDay: V,
  });
  assert.equal(r.adjusted, false);
  assert.equal(r.marker, null);
});

test("fatura fechada: compra parcelada é reposicionada pra fatura escolhida, não pela aritmética N-1", () => {
  const compra = new Date("2026-07-17T12:00:00Z"); // data que o banco manda em toda parcela
  const setembro = { year: 2026, month: 9 };

  const r = resolveImportDate(compra, "AMAZON 2/12", {
    importKind: "CLOSED_INVOICE",
    invoiceRef: setembro,
    isCard: true,
    closingDay: C,
    dueDay: V,
  });

  assert.equal(r.adjusted, true);
  assert.equal(r.matched, true);
  assert.equal(invoiceLabel(invoiceForPurchase(r.date, C, V)), "09/2026");
  assert.deepEqual(r.marker, { number: 2, total: 12 });
});

test("fatura fechada: compra sem parcela, já dentro do ciclo, não precisa de ajuste", () => {
  // 15/09 cai dentro do ciclo que fecha 30/09 (a fatura de outubro, não a de
  // setembro, nesse fechamento) — o teste importante é: se já está no ciclo
  // certo, `adjusted` fica false.
  const dentroDoCiclo = new Date("2026-09-15T12:00:00Z");
  const target = invoiceForPurchase(dentroDoCiclo, C, V);

  const r = resolveImportDate(dentroDoCiclo, "IFOOD", {
    importKind: "CLOSED_INVOICE",
    invoiceRef: target,
    isCard: true,
    closingDay: C,
    dueDay: V,
  });

  assert.equal(r.adjusted, false);
  assert.equal(r.date.getTime(), dentroDoCiclo.getTime());
});

test("fatura fechada: reposiciona mesmo uma compra fora de parcela, se a data não bate com a fatura", () => {
  // Simula um export com data de liquidação diferente do período — a fatura
  // escolhida é quem manda, mesmo sem marcador de parcela.
  const dataEstranha = new Date("2026-05-02T12:00:00Z");
  const setembro = { year: 2026, month: 9 };

  const r = resolveImportDate(dataEstranha, "LOJA X", {
    importKind: "CLOSED_INVOICE",
    invoiceRef: setembro,
    isCard: true,
    closingDay: C,
    dueDay: V,
  });

  assert.equal(r.adjusted, true);
  assert.equal(invoiceLabel(invoiceForPurchase(r.date, C, V)), "09/2026");
});
