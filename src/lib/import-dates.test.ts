import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveImportDate } from "./import-dates";

test("parcela 1 fica como veio, sem ajuste", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "AMAZON 1/12", { isCard: true });
  assert.equal(r.adjusted, false);
  assert.equal(r.date.getTime(), compra.getTime());
  assert.deepEqual(r.marker, { number: 1, total: 12 });
});

test("parcela 2/12 avança um mês a partir da compra original", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "AMAZON 2/12", { isCard: true });
  assert.equal(r.adjusted, true);
  assert.equal(r.date.getUTCFullYear(), 2026);
  assert.equal(r.date.getUTCMonth() + 1, 8); // agosto
  assert.equal(r.date.getUTCDate(), 17);
});

test("parcela em conta que não é cartão não é mexida", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "ALGO 2/12", { isCard: false });
  assert.equal(r.adjusted, false);
  assert.equal(r.date.getTime(), compra.getTime());
});

test("sem marcador de parcela, data não muda", () => {
  const compra = new Date("2026-07-17T12:00:00Z");
  const r = resolveImportDate(compra, "IFOOD LANCHONETE", { isCard: true });
  assert.equal(r.adjusted, false);
  assert.equal(r.marker, null);
});
