import { test } from "vitest";
import assert from "node:assert/strict";
import { parseMoneyToCents } from "./money";

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
