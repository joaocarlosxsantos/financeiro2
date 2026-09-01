import { test } from "vitest";
import assert from "node:assert/strict";
import { accountBalance, cardOwed, netWorth } from "./balances";

test("saldo parte do saldo inicial", () => {
  assert.equal(accountBalance({ openingCents: 100000, incomeCents: 0, expenseCents: 0 }), 100000);
  assert.equal(
    accountBalance({ openingCents: 100000, incomeCents: 720000, expenseCents: 430000 }),
    390000,
  );
  // conta pode ficar negativa — cheque especial existe
  assert.equal(accountBalance({ openingCents: 0, incomeCents: 0, expenseCents: 5000 }), -5000);
});

test("cartão: compras aumentam a dívida, estorno e pagamento diminuem", () => {
  assert.equal(cardOwed({ purchasesCents: 200000, creditsCents: 0, invoicePaymentsCents: 0 }), 200000);
  assert.equal(
    cardOwed({ purchasesCents: 200000, creditsCents: 15000, invoicePaymentsCents: 100000 }),
    85000,
  );
  // pagou mais do que devia: a dívida é zero, não negativa
  assert.equal(
    cardOwed({ purchasesCents: 100000, creditsCents: 0, invoicePaymentsCents: 150000 }),
    0,
  );
});

test("patrimônio líquido desconta cartão e dívidas", () => {
  assert.equal(
    netWorth({
      availableCents: 500000,
      savedInGoalsCents: 1000000,
      cardOwedCents: 200000,
      debtBalanceCents: 300000,
    }),
    1000000,
  );
  // mais dívida do que patrimônio dá negativo, e tem que aparecer assim
  assert.equal(
    netWorth({
      availableCents: 10000,
      savedInGoalsCents: 0,
      cardOwedCents: 0,
      debtBalanceCents: 500000,
    }),
    -490000,
  );
});
