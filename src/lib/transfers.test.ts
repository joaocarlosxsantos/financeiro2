import { test } from "vitest";
import assert from "node:assert/strict";
import { transferLegs } from "./transfers";
import { accountBalance } from "./balances";
import { MAX_CENTS } from "./money";

test("kinds opostos, mesmo valor e mesma data", () => {
  const date = new Date("2026-10-03T12:00:00.000Z");
  const [outLeg, inLeg] = transferLegs("acc-corrente", "acc-poupanca", 50000, date, "Reserva de emergência", "grp-123");

  assert.equal(outLeg.kind, "EXPENSE");
  assert.equal(inLeg.kind, "INCOME");

  assert.equal(outLeg.amountCents, 50000);
  assert.equal(inLeg.amountCents, 50000);

  assert.equal(outLeg.date.toISOString(), date.toISOString());
  assert.equal(inLeg.date.toISOString(), date.toISOString());

  assert.equal(outLeg.isTransfer, true);
  assert.equal(inLeg.isTransfer, true);

  assert.equal(outLeg.transferGroupId, "grp-123");
  assert.equal(inLeg.transferGroupId, "grp-123");

  assert.equal(outLeg.accountId, "acc-corrente");
  assert.equal(inLeg.accountId, "acc-poupanca");

  assert.equal(outLeg.notes, "Reserva de emergência");
  assert.equal(inLeg.notes, "Reserva de emergência");
});

test("valores e contas inválidos rejeitados", () => {
  const date = new Date("2026-10-03T12:00:00.000Z");

  // Origem e destino iguais
  assert.throws(
    () => transferLegs("acc-mesma", "acc-mesma", 1000, date, null, "grp-1"),
    /Contas de origem e destino devem ser diferentes/,
  );

  // Origem ou destino vazios
  assert.throws(
    () => transferLegs("", "acc-dest", 1000, date, null, "grp-1"),
    /obrigatórias/,
  );
  assert.throws(
    () => transferLegs("acc-origem", "", 1000, date, null, "grp-1"),
    /obrigatórias/,
  );

  // Valor zero ou negativo
  assert.throws(
    () => transferLegs("acc-1", "acc-2", 0, date, null, "grp-1"),
    /positivo/,
  );
  assert.throws(
    () => transferLegs("acc-1", "acc-2", -500, date, null, "grp-1"),
    /positivo/,
  );

  // Valor com fração de centavo (não inteiro)
  assert.throws(
    () => transferLegs("acc-1", "acc-2", 10.5, date, null, "grp-1"),
    /inteiro/,
  );

  // Valor acima de MAX_CENTS
  assert.throws(
    () => transferLegs("acc-1", "acc-2", MAX_CENTS + 1, date, null, "grp-1"),
    /não pode exceder/,
  );

  // groupId vazio ou ausente
  assert.throws(
    () => transferLegs("acc-1", "acc-2", 1000, date, null, ""),
    /ID do grupo de transferência é obrigatório/,
  );
});

test("fingerprints certos para perna de saída e entrada", () => {
  const date = new Date("2026-10-03T12:00:00.000Z");
  const [outLeg, inLeg] = transferLegs("acc-1", "acc-2", 25000, date, null, "grp-abc-999");

  assert.equal(outLeg.fingerprint, "xfer:grp-abc-999|out");
  assert.equal(inLeg.fingerprint, "xfer:grp-abc-999|in");
});

test("availableCents é invariante após aplicar as pernas da transferência", () => {
  // Simulação de duas contas (ex: Corrente e Poupança) usando accountBalance (balances.ts:20)
  const contaA = { openingCents: 100000, incomeCents: 0, expenseCents: 0 };
  const contaB = { openingCents: 50000, incomeCents: 0, expenseCents: 0 };

  const availableCentsBefore = accountBalance(contaA) + accountBalance(contaB);
  assert.equal(availableCentsBefore, 150000);

  const transferAmount = 30000;
  const date = new Date("2026-10-03T12:00:00.000Z");
  const [outLeg, inLeg] = transferLegs("acc-A", "acc-B", transferAmount, date, null, "grp-xfer-1");

  // Aplica saída na conta de origem
  if (outLeg.kind === "EXPENSE") {
    contaA.expenseCents += outLeg.amountCents;
  }
  // Aplica entrada na conta de destino
  if (inLeg.kind === "INCOME") {
    contaB.incomeCents += inLeg.amountCents;
  }

  const saldoA = accountBalance(contaA);
  const saldoB = accountBalance(contaB);

  assert.equal(saldoA, 70000);
  assert.equal(saldoB, 80000);

  const availableCentsAfter = saldoA + saldoB;
  assert.equal(availableCentsAfter, availableCentsBefore);
});

test("perna anterior ao openingBalanceDate não conta no saldo da conta destino", () => {
  // Conforme regra de balances / queries.ts:1021:
  // Lançamentos com tx.date < openingBalanceDate são ignorados na apuração do saldo.
  const openingBalanceDate = new Date("2026-10-01T00:00:00.000Z");
  const contaDestino = {
    openingCents: 50000,
    openingBalanceDate,
    incomeCents: 0,
    expenseCents: 0,
  };

  // Helper de cálculo de saldo respeitando openingBalanceDate
  function computeBalance(
    account: { openingCents: number; openingBalanceDate: Date | null },
    txs: Array<{ amountCents: number; kind: "INCOME" | "EXPENSE"; date: Date }>,
  ) {
    let incomeCents = 0;
    let expenseCents = 0;

    for (const tx of txs) {
      if (!account.openingBalanceDate || tx.date >= account.openingBalanceDate) {
        if (tx.kind === "INCOME") incomeCents += tx.amountCents;
        if (tx.kind === "EXPENSE") expenseCents += tx.amountCents;
      }
    }

    return accountBalance({
      openingCents: account.openingCents,
      incomeCents,
      expenseCents,
    });
  }

  // 1) Transferência com data anterior ao openingBalanceDate (ex: 2026-09-15)
  const dataAnterior = new Date("2026-09-15T12:00:00.000Z");
  const [, inLegAnterior] = transferLegs("acc-origem", "acc-destino", 20000, dataAnterior, null, "grp-old");

  const saldoIgnorando = computeBalance(contaDestino, [inLegAnterior]);
  assert.equal(saldoIgnorando, 50000); // Não somou os 20000 pois data < openingBalanceDate

  // 2) Transferência com data posterior ou igual ao openingBalanceDate (ex: 2026-10-02)
  const dataValida = new Date("2026-10-02T12:00:00.000Z");
  const [, inLegValida] = transferLegs("acc-origem", "acc-destino", 20000, dataValida, null, "grp-new");

  const saldoContando = computeBalance(contaDestino, [inLegValida]);
  assert.equal(saldoContando, 70000); // Somou os 20000
});
