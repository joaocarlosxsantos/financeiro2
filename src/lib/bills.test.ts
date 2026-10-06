import { test } from "vitest";
import assert from "node:assert/strict";
import { checkManualSplit, getBillStatus, recalculateSplit, splitBillEqually } from "./bills";

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

test("recalculateSplit: divisão igual - adicionar participante recalcula todos", () => {
  const total = 100;
  const oldAmounts = [50, 50]; // splitBillEqually(100, 2)
  const next = recalculateSplit(total, oldAmounts, 3);
  assert.deepEqual(next, splitBillEqually(total, 3)); // [34, 33, 33]
  assert.equal(next.reduce((a, b) => a + b, 0), total);
});

test("recalculateSplit: divisão igual - remover participante recalcula todos", () => {
  const total = 100;
  const oldAmounts = [34, 33, 33]; // splitBillEqually(100, 3)
  const next = recalculateSplit(total, oldAmounts, 1);
  assert.deepEqual(next, splitBillEqually(total, 1)); // [100]
  assert.equal(next.reduce((a, b) => a + b, 0), total);
});

test("recalculateSplit: divisão manual - adicionar participante zera novo", () => {
  const total = 100;
  const oldAmounts = [70, 30]; // manual, soma = total
  const next = recalculateSplit(total, oldAmounts, 3);
  assert.deepEqual(next, [70, 30, 0]);
  assert.equal(next.reduce((a, b) => a + b, 0), total);
});

test("recalculateSplit: divisão manual - remover participante mantém restantes", () => {
  const total = 100;
  const oldAmounts = [70, 30, 0]; // manual, soma = total
  const next = recalculateSplit(total, oldAmounts, 2);
  assert.deepEqual(next, [70, 30]);
  assert.equal(next.reduce((a, b) => a + b, 0), total);
});

test("recalculateSplit: divisão manual - remover do meio filtra o correto", () => {
  const total = 100;
  const oldAmounts = [70, 30, 0]; // manual, soma = total
  const next = recalculateSplit(total, oldAmounts, 2, 1); // remove índice 1 (30)
  assert.deepEqual(next, [70, 0]);
  assert.equal(next.reduce((a, b) => a + b, 0), 70); // soma não bate com total - esperado em divisão manual
});

test("getBillStatus: conta paga sempre retorna PAGA independentemente da data", () => {
  const now = new Date(2026, 9, 15); // 15 de Outubro de 2026
  assert.equal(getBillStatus({ paid: true, dueDay: 5, year: 2026, month: 10 }, now), "PAGA");
  assert.equal(getBillStatus({ paid: true, dueDay: 20, year: 2026, month: 10 }, now), "PAGA");
  assert.equal(getBillStatus({ paid: true, dueDay: 10, year: 2025, month: 5 }, now), "PAGA");
  assert.equal(getBillStatus({ paid: true, dueDay: null, year: 2025, month: 1 }, now), "PAGA");
});

test("getBillStatus: não paga com ano ou mês anterior retorna VENCIDA", () => {
  const now = new Date(2026, 9, 15); // 15 de Outubro de 2026
  // Ano anterior
  assert.equal(getBillStatus({ paid: false, dueDay: null, year: 2025, month: 12 }, now), "VENCIDA");
  assert.equal(getBillStatus({ paid: false, dueDay: 30, year: 2025, month: 10 }, now), "VENCIDA");
  // Mês anterior do mesmo ano
  assert.equal(getBillStatus({ paid: false, dueDay: null, year: 2026, month: 9 }, now), "VENCIDA");
  assert.equal(getBillStatus({ paid: false, dueDay: 28, year: 2026, month: 9 }, now), "VENCIDA");
});

test("getBillStatus: não paga no mês atual com dia de vencimento ultrapassado retorna VENCIDA", () => {
  const now = new Date(2026, 9, 15); // 15 de Outubro de 2026
  assert.equal(getBillStatus({ paid: false, dueDay: 14, year: 2026, month: 10 }, now), "VENCIDA");
  assert.equal(getBillStatus({ paid: false, dueDay: 1, year: 2026, month: 10 }, now), "VENCIDA");
});

test("getBillStatus: não paga no mês atual no dia do vencimento ou antes retorna PENDENTE", () => {
  const now = new Date(2026, 9, 15); // 15 de Outubro de 2026
  // Exatamente no dia do vencimento (now.dia <= dueDay)
  assert.equal(getBillStatus({ paid: false, dueDay: 15, year: 2026, month: 10 }, now), "PENDENTE");
  // Antes do vencimento
  assert.equal(getBillStatus({ paid: false, dueDay: 16, year: 2026, month: 10 }, now), "PENDENTE");
  assert.equal(getBillStatus({ paid: false, dueDay: 31, year: 2026, month: 10 }, now), "PENDENTE");
});

test("getBillStatus: não paga no mês atual sem dueDay (null) retorna PENDENTE", () => {
  const now = new Date(2026, 9, 15); // 15 de Outubro de 2026
  assert.equal(getBillStatus({ paid: false, dueDay: null, year: 2026, month: 10 }, now), "PENDENTE");
});

test("getBillStatus: não paga em mês futuro retorna PENDENTE", () => {
  const now = new Date(2026, 9, 15); // 15 de Outubro de 2026
  // Mês seguinte mesmo ano
  assert.equal(getBillStatus({ paid: false, dueDay: 5, year: 2026, month: 11 }, now), "PENDENTE");
  assert.equal(getBillStatus({ paid: false, dueDay: null, year: 2026, month: 11 }, now), "PENDENTE");
  // Ano seguinte
  assert.equal(getBillStatus({ paid: false, dueDay: 5, year: 2027, month: 1 }, now), "PENDENTE");
});

test("getBillStatus: respeita fuso America/Sao_Paulo entre 21h e 23h59 BRT (00h a 03h UTC do dia seguinte)", () => {
  // 15 de Outubro de 2026 às 21:00 BRT -> 2026-10-16T00:00:00Z
  const at21h = new Date("2026-10-16T00:00:00.000Z");
  // 15 de Outubro de 2026 às 22:30 BRT -> 2026-10-16T01:30:00Z
  const at22h30 = new Date("2026-10-16T01:30:00.000Z");
  // 15 de Outubro de 2026 às 23:59:59 BRT -> 2026-10-16T02:59:59Z
  const at23h59 = new Date("2026-10-16T02:59:59.000Z");
  // 16 de Outubro de 2026 às 00:00:01 BRT -> 2026-10-16T03:00:01Z
  const atNextDay00h = new Date("2026-10-16T03:00:01.000Z");

  const billDue15 = { paid: false, dueDay: 15, year: 2026, month: 10 };

  // Em todos esses horários, no fuso de SP ainda é dia 15 -> PENDENTE
  assert.equal(getBillStatus(billDue15, at21h), "PENDENTE");
  assert.equal(getBillStatus(billDue15, at22h30), "PENDENTE");
  assert.equal(getBillStatus(billDue15, at23h59), "PENDENTE");

  // Passou da meia-noite em SP (dia 16) -> VENCIDA
  assert.equal(getBillStatus(billDue15, atNextDay00h), "VENCIDA");
});

test("getBillStatus: calcula dueDay efetivo como Math.min(bill.dueDay, último dia do mês)", () => {
  // Conta com dueDay=31 em abril (mês de 30 dias)
  const billApril31 = { paid: false, dueDay: 31, year: 2026, month: 4 };

  // 30 de Abril às 22h BRT (01h UTC do dia 1 de maio) -> ainda é dia 30 em SP, último dia -> PENDENTE
  const april30At22h = new Date("2026-05-01T01:00:00.000Z");
  assert.equal(getBillStatus(billApril31, april30At22h), "PENDENTE");

  // 1 de Maio às 00h05 BRT -> mês já virou -> VENCIDA
  const may1At00h = new Date("2026-05-01T03:05:00.000Z");
  assert.equal(getBillStatus(billApril31, may1At00h), "VENCIDA");

  // Conta com dueDay=31 em fevereiro de 2026 (28 dias)
  const billFeb31 = { paid: false, dueDay: 31, year: 2026, month: 2 };

  // 28 de Fevereiro às 23h BRT -> último dia efetivo -> PENDENTE
  const feb28At23h = new Date("2026-03-01T02:00:00.000Z");
  assert.equal(getBillStatus(billFeb31, feb28At23h), "PENDENTE");

  // 1 de Março às 00h30 BRT -> VENCIDA
  const mar1At00h = new Date("2026-03-01T03:30:00.000Z");
  assert.equal(getBillStatus(billFeb31, mar1At00h), "VENCIDA");
});

