import { test } from "vitest";
import assert from "node:assert/strict";
import { addMonthsKeepingDay, parseInstallmentMarker, splitInstallments } from "./installments";

test("parcelamento não perde centavo", () => {
  for (const [total, count] of [
    [499999, 12],
    [10000, 3],
    [1, 3],
    [123456, 7],
  ] as const) {
    const parts = splitInstallments(total, count);
    assert.equal(parts.length, count);
    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      total,
      `a soma de ${count}x de ${total} tem que bater`,
    );
    // a diferença entre a maior e a menor parcela nunca passa de 1 centavo
    assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
  }
});

test("parcelas caem no mesmo dia dos meses seguintes", () => {
  const base = new Date("2026-01-31T12:00:00Z");
  assert.equal(addMonthsKeepingDay(base, 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(addMonthsKeepingDay(base, 2).toISOString().slice(0, 10), "2026-03-31");
  assert.equal(addMonthsKeepingDay(base, 12).toISOString().slice(0, 10), "2027-01-31");
});

test("identifica parcela N/T em formatos comuns de extrato", () => {
  assert.deepEqual(parseInstallmentMarker("UBER 3/10"), { number: 3, total: 10 });
  assert.deepEqual(parseInstallmentMarker("Compra parcelada - Parcela 02/12"), {
    number: 2,
    total: 12,
  });
  assert.deepEqual(parseInstallmentMarker("AMAZON PARC 5 DE 8"), { number: 5, total: 8 });
  assert.equal(parseInstallmentMarker("MERCADO LIVRE"), null);
  // não é parcela: 17 > 07, então nem passa no formato "N/T no final"
  assert.equal(parseInstallmentMarker("PAGAMENTO REF 17/07"), null);
  // parcela maior que o total não faz sentido
  assert.equal(parseInstallmentMarker("LOJA 15/10"), null);
  // total implausível (mais que 60 parcelas) não é parcelamento de cartão
  assert.equal(parseInstallmentMarker("LOJA 2/99"), null);
});
