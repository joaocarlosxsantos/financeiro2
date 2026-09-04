import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveImportDate } from "./import-dates";

test("cartão com mês de referência: linha vai para o mês escolhido, preservando o dia", () => {
  const impressa = new Date("2026-01-17T12:00:00Z"); // data de compra original no arquivo
  const r = resolveImportDate(impressa, "AMAZON 9/12", { isCard: true, invoiceRef: { year: 2026, month: 9 } });
  assert.equal(r.adjusted, true);
  assert.equal(r.date.getUTCFullYear(), 2026);
  assert.equal(r.date.getUTCMonth() + 1, 9); // setembro, o mês escolhido — não dezembro/25 nem nenhuma conta a partir da parcela
  assert.equal(r.date.getUTCDate(), 17);
  assert.deepEqual(r.marker, { number: 9, total: 12 });
});

test("cartão com mês de referência: linha sem parcela também vai para o mês escolhido", () => {
  const impressa = new Date("2026-08-03T12:00:00Z");
  const r = resolveImportDate(impressa, "IFOOD LANCHONETE", { isCard: true, invoiceRef: { year: 2026, month: 9 } });
  assert.equal(r.adjusted, true);
  assert.equal(r.date.getUTCMonth() + 1, 9);
  assert.equal(r.marker, null);
});

test("cartão com mês de referência: dia 31 num mês curto cai no último dia disponível", () => {
  const impressa = new Date("2026-01-31T12:00:00Z");
  const r = resolveImportDate(impressa, "LOJA X", { isCard: true, invoiceRef: { year: 2026, month: 2 } });
  assert.equal(r.date.getUTCMonth() + 1, 2);
  assert.equal(r.date.getUTCDate(), 28); // fevereiro de 2026 não é bissexto
});

test("cartão sem mês de referência: data não é mexida (falta escolher o mês)", () => {
  const impressa = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(impressa, "AMAZON 2/12", { isCard: true });
  assert.equal(r.adjusted, false);
  assert.equal(r.date.getTime(), impressa.getTime());
});

test("conta que não é cartão nunca tem a data mexida, mesmo com invoiceRef", () => {
  const impressa = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(impressa, "ALGO 2/12", {
    isCard: false,
    invoiceRef: { year: 2026, month: 9 },
  });
  assert.equal(r.adjusted, false);
  assert.equal(r.date.getTime(), impressa.getTime());
  assert.deepEqual(r.marker, { number: 2, total: 12 });
});
