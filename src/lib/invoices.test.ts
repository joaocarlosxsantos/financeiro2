import { test } from "vitest";
import assert from "node:assert/strict";
import {
  closingDateFor,
  compareInvoiceRef,
  dateWithinInvoice,
  dueDateFor,
  invoiceForPurchase,
  invoiceLabel,
  invoiceStatus,
  periodStartFor,
} from "./invoices";

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("cartão que fecha dia 27 e vence dia 5 do mês seguinte", () => {
  const C = 27;
  const V = 5;
  const set = { year: 2026, month: 9 };

  assert.equal(iso(closingDateFor(set, C, V)), "2026-08-27");
  assert.equal(iso(dueDateFor(set, V)), "2026-09-05");
  assert.equal(iso(periodStartFor(set, C, V)), "2026-07-28");

  // compra no dia do fechamento ainda entra nesta fatura
  assert.equal(invoiceLabel(invoiceForPurchase(new Date("2026-08-27T12:00Z"), C, V)), "09/2026");
  // no dia seguinte já vai para a próxima
  assert.equal(invoiceLabel(invoiceForPurchase(new Date("2026-08-28T12:00Z"), C, V)), "10/2026");
  assert.equal(invoiceLabel(invoiceForPurchase(new Date("2026-08-26T12:00Z"), C, V)), "09/2026");
});

test("virada de ano", () => {
  assert.equal(invoiceLabel(invoiceForPurchase(new Date("2026-12-28T12:00Z"), 27, 5)), "02/2027");
});

test("cartão que fecha e vence no mesmo mês", () => {
  const C = 1;
  const V = 10;
  assert.equal(iso(closingDateFor({ year: 2026, month: 9 }, C, V)), "2026-09-01");
  assert.equal(invoiceLabel(invoiceForPurchase(new Date("2026-09-01T12:00Z"), C, V)), "09/2026");
  assert.equal(invoiceLabel(invoiceForPurchase(new Date("2026-09-02T12:00Z"), C, V)), "10/2026");
});

test("dia de fechamento maior que o mês", () => {
  assert.equal(iso(closingDateFor({ year: 2027, month: 3 }, 31, 10)), "2027-02-28");
});

test("estado da fatura ao longo do ciclo", () => {
  const C = 27;
  const V = 5;
  const set = { year: 2026, month: 9 }; // fecha 27/08, vence 05/09
  const st = (dia: string, paga = false) =>
    invoiceStatus(set, C, V, paga, new Date(`${dia}T12:00:00Z`));

  assert.equal(st("2026-08-20"), "aberta");
  assert.equal(st("2026-08-27"), "aberta", "no dia do fechamento ainda dá para comprar");
  assert.equal(st("2026-08-28"), "fechada");
  assert.equal(st("2026-09-05"), "fechada", "no dia do vencimento ainda não está vencida");
  assert.equal(st("2026-09-06"), "vencida");
  assert.equal(st("2026-09-20"), "vencida");
  // passada a tolerância, vira histórico em vez de alarme falso
  assert.equal(st("2026-09-25"), "sem-registro");
  assert.equal(st("2027-01-01"), "sem-registro");
  // pagamento registrado vence qualquer data
  assert.equal(st("2027-01-01", true), "paga");
});

test("dateWithinInvoice empurra a data da compra original até a fatura alvo", () => {
  const C = 5; // fecha dia 5
  const V = 12; // vence dia 12 do mesmo mês

  // Compra em 17/07 cai na fatura de agosto (fecha 05/08, compra é depois).
  const compra = new Date("2026-07-17T12:00:00Z");
  assert.equal(invoiceLabel(invoiceForPurchase(compra, C, V)), "08/2026");

  // 2ª parcela de 12: precisa cair na fatura de setembro.
  const target = { year: 2026, month: 9 };
  const result = dateWithinInvoice(compra, target, C, V);
  assert.equal(result.matched, true);
  assert.equal(result.monthsShifted, 1);
  assert.equal(invoiceLabel(invoiceForPurchase(result.date, C, V)), "09/2026");
  // mantém o dia 17 (o dia do mês não muda, só o mês)
  assert.equal(result.date.getUTCDate(), 17);

  // Uma compra que já cai na fatura certa não precisa de ajuste.
  const jaCerta = dateWithinInvoice(compra, { year: 2026, month: 8 }, C, V);
  assert.equal(jaCerta.monthsShifted, 0);
  assert.equal(jaCerta.date.getTime(), compra.getTime());

  // Indo pra trás também funciona (fatura alvo é anterior à calculada).
  const paraTras = dateWithinInvoice(compra, { year: 2026, month: 7 }, C, V);
  assert.equal(paraTras.matched, true);
  assert.equal(paraTras.monthsShifted, -1);
  assert.equal(invoiceLabel(invoiceForPurchase(paraTras.date, C, V)), "07/2026");
});

test("compareInvoiceRef ordena faturas no tempo", () => {
  assert.ok(compareInvoiceRef({ year: 2026, month: 1 }, { year: 2026, month: 2 }) < 0);
  assert.ok(compareInvoiceRef({ year: 2026, month: 12 }, { year: 2027, month: 1 }) < 0);
  assert.equal(compareInvoiceRef({ year: 2026, month: 5 }, { year: 2026, month: 5 }), 0);
});
