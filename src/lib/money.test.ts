import { test } from "vitest";
import assert from "node:assert/strict";
import { formatCents, formatCentsParts, parseMoneyToCents } from "./money";

test("lê os formatos que aparecem em extrato e digitação", () => {
  assert.equal(parseMoneyToCents("1.234,56"), 123456);
  assert.equal(parseMoneyToCents("1234.56"), 123456);
  assert.equal(parseMoneyToCents("R$ 1.234,56"), 123456);
  assert.equal(parseMoneyToCents("1234"), 123400);
  assert.equal(parseMoneyToCents("-45,90"), -4590);
  // Vírgula com 3 dígitos é separador de milhar (formato de export gringo),
  // não decimal — ninguém digita preço com 3 casas.
  assert.equal(parseMoneyToCents("1,234"), 123400);
  assert.equal(parseMoneyToCents("1.234"), 123400);
  assert.equal(parseMoneyToCents("12,34"), 1234);
  assert.equal(parseMoneyToCents(""), 0);
  assert.equal(parseMoneyToCents("abc"), 0);
});

test("nunca mostra sinal de menos em zero (Intl.NumberFormat marca -0 como negativo)", () => {
  assert.equal(formatCents(0), "R$ 0,00");
  // O jeito mais comum de gerar -0 no app: inverter um saldo que já é zero
  // pra exibir como dívida/saída (`-saldoDevedor`).
  assert.equal(formatCents(-0), "R$ 0,00");
  const saldoDevedor = 0;
  assert.equal(formatCents(-saldoDevedor), "R$ 0,00");
});

test("formatCentsParts: negativo, zero, milhar e centavos", () => {
  // negativo
  const neg = formatCentsParts(-4590);
  assert.equal(neg.negative, true);
  assert.equal(neg.integer, "45");
  assert.equal(neg.fraction, "90");
  assert.equal(neg.currency, "R$");

  // zero e -0
  const zero = formatCentsParts(0);
  assert.equal(zero.negative, false);
  assert.equal(zero.integer, "0");
  assert.equal(zero.fraction, "00");

  const negZero = formatCentsParts(-0);
  assert.equal(negZero.negative, false);
  assert.equal(negZero.integer, "0");
  assert.equal(negZero.fraction, "00");

  // milhar
  const milhar = formatCentsParts(123456);
  assert.equal(milhar.negative, false);
  assert.equal(milhar.integer, "1.234");
  assert.equal(milhar.fraction, "56");

  const milhao = formatCentsParts(100000000);
  assert.equal(milhao.integer, "1.000.000");
  assert.equal(milhao.fraction, "00");

  // centavos
  const centavos = formatCentsParts(50);
  assert.equal(centavos.integer, "0");
  assert.equal(centavos.fraction, "50");

  const cincoCentavos = formatCentsParts(5);
  assert.equal(cincoCentavos.integer, "0");
  assert.equal(cincoCentavos.fraction, "05");
});
