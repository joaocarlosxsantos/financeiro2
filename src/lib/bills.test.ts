import { test } from "vitest";
import assert from "node:assert/strict";
import { checkManualSplit, splitBillEqually } from "./bills";

test("dividir igualmente: sem perder centavo, primeiras pessoas absorvem o resto", () => {
  const parts = splitBillEqually(5400, 3); // R$54,00 entre 3 pessoas
  assert.deepEqual(parts, [1800, 1800, 1800]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 5400);
});

test("dividir igualmente: valor que não divide exato", () => {
  const parts = splitBillEqually(10000, 3); // R$100,00 entre 3 -> 33,34 / 33,33 / 33,33
  assert.deepEqual(parts, [3334, 3333, 3333]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10000);
});

test("divisão manual que bate exatamente com o total: ok", () => {
  const r = checkManualSplit(5400, [1800, 1800, 1800]);
  assert.equal(r.ok, true);
  assert.equal(r.remainingCents, 0);
});

test("divisão manual que falta: aponta quanto falta", () => {
  const r = checkManualSplit(5400, [1000, 1000, 1000]);
  assert.equal(r.ok, false);
  assert.equal(r.remainingCents, 2400);
});

test("divisão manual que passa do total: aponta negativo", () => {
  const r = checkManualSplit(5400, [2000, 2000, 2000]);
  assert.equal(r.ok, false);
  assert.equal(r.remainingCents, -600);
});
