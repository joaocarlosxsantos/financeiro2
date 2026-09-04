import { test } from "vitest";
import assert from "node:assert/strict";
import { accountBalance, netWorth } from "./balances";

test("saldo parte do saldo inicial", () => {
  assert.equal(accountBalance({ openingCents: 100000, incomeCents: 0, expenseCents: 0 }), 100000);
  assert.equal(
    accountBalance({ openingCents: 100000, incomeCents: 720000, expenseCents: 430000 }),
    390000,
  );
  // conta pode ficar negativa — cheque especial existe
  assert.equal(accountBalance({ openingCents: 0, incomeCents: 0, expenseCents: 5000 }), -5000);
});

test("patrimônio líquido soma disponível e reservas, desconta dívidas", () => {
  assert.equal(
    netWorth({
      availableCents: 500000,
      savedInGoalsCents: 1000000,
      debtBalanceCents: 300000,
    }),
    1200000,
  );
  // mais dívida do que patrimônio dá negativo, e tem que aparecer assim
  assert.equal(
    netWorth({
      availableCents: 10000,
      savedInGoalsCents: 0,
      debtBalanceCents: 500000,
    }),
    -490000,
  );
});
