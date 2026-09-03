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

test("pagar a fatura não muda o patrimônio líquido — só move o dinheiro", () => {
  // Compra de R$800 no cartão (já virou despesa no dia da compra, não aqui).
  const purchaseCents = 80000;
  // Conta corrente com R$1000 de saldo inicial, sem nenhum outro lançamento.
  const openingCents = 100000;

  const beforePayment = {
    availableCents: accountBalance({ openingCents, incomeCents: 0, expenseCents: 0 }),
    cardOwedCents: cardOwed({
      purchasesCents: purchaseCents,
      creditsCents: 0,
      invoicePaymentsCents: 0,
    }),
  };
  const netWorthBefore = netWorth({
    availableCents: beforePayment.availableCents,
    savedInGoalsCents: 0,
    cardOwedCents: beforePayment.cardOwedCents,
    debtBalanceCents: 0,
  });

  // Paga a fatura inteira a partir da conta corrente: o pagamento entra como
  // saída na conta que pagou (é o que a query de saldo por conta faz agora)
  // e reduz o quanto se deve no cartão.
  const afterPayment = {
    availableCents: accountBalance({ openingCents, incomeCents: 0, expenseCents: purchaseCents }),
    cardOwedCents: cardOwed({
      purchasesCents: purchaseCents,
      creditsCents: 0,
      invoicePaymentsCents: purchaseCents,
    }),
  };
  const netWorthAfter = netWorth({
    availableCents: afterPayment.availableCents,
    savedInGoalsCents: 0,
    cardOwedCents: afterPayment.cardOwedCents,
    debtBalanceCents: 0,
  });

  // O dinheiro saiu da conta e a dívida sumiu — o total não pode ter mudado.
  assert.equal(netWorthAfter, netWorthBefore);
  // E a conta que pagou realmente ficou com menos dinheiro (o bug que isso
  // corrige: antes o pagamento não aparecia em lugar nenhum).
  assert.equal(afterPayment.availableCents, beforePayment.availableCents - purchaseCents);
  assert.equal(afterPayment.cardOwedCents, 0);
});
