import { test } from "vitest";
import assert from "node:assert/strict";
import { isInvoicePaymentLine } from "./import-filters";

test("reconhece variações comuns de confirmação de pagamento da fatura", () => {
  assert.equal(isInvoicePaymentLine("PAGAMENTO ON LINE"), true);
  assert.equal(isInvoicePaymentLine("Pagamento On-line"), true);
  assert.equal(isInvoicePaymentLine("PAGAMENTO ONLINE"), true);
  assert.equal(isInvoicePaymentLine("Pagamento Efetuado"), true);
  assert.equal(isInvoicePaymentLine("PGTO ONLINE  DEBITO EM CC"), true);
});

test("não reconhece compra comum, mesmo com valor parecido", () => {
  assert.equal(isInvoicePaymentLine("LOJAS RENNER FL 153"), false);
  assert.equal(isInvoicePaymentLine("IFOOD LANCHONETE"), false);
});

test("não reconhece 'pagamento' como parte do meio da descrição", () => {
  assert.equal(isInvoicePaymentLine("LOJA PAGAMENTO DIGITAL LTDA"), false);
});
