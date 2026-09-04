import { test } from "vitest";
import assert from "node:assert/strict";
import { formatCents, parseMoneyToCents } from "./money";

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
