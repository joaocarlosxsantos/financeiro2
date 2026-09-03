/**
 * Ciclo de fatura de cartão de crédito.
 *
 * A ideia central: **a compra é despesa no dia em que você compra**, não no dia
 * em que a fatura é paga. O pagamento da fatura é só um movimento entre contas
 * suas — se ele também contasse como gasto, tudo apareceria em dobro.
 *
 * A fatura é identificada pelo mês do VENCIMENTO, que é como as pessoas falam
 * dela ("a fatura de setembro").
 *
 * Funções puras — sem banco, importáveis pelo cliente.
 */

import { addMonthsKeepingDay } from "./installments";

export const DEFAULT_CLOSING_DAY = 27;
export const DEFAULT_DUE_DAY = 5;

export type InvoiceRef = { year: number; month: number };

function clampDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(1, day), lastDay), 12));
}

/** Data de fechamento da fatura que vence em (year, month). */
export function closingDateFor(ref: InvoiceRef, closingDay: number, dueDay: number): Date {
  // Vencimento no mesmo mês do fechamento só acontece quando cai depois dele.
  // Caso contrário (fecha dia 27, vence dia 5), o fechamento é no mês anterior.
  const sameMonth = dueDay > closingDay;
  const month = sameMonth ? ref.month : ref.month - 1;
  const year = month < 1 ? ref.year - 1 : ref.year;
  return clampDay(year, month < 1 ? 12 : month, closingDay);
}

/** Data de vencimento da fatura de (year, month). */
export function dueDateFor(ref: InvoiceRef, dueDay: number): Date {
  return clampDay(ref.year, ref.month, dueDay);
}

/** Primeiro dia coberto pela fatura (o dia seguinte ao fechamento anterior). */
export function periodStartFor(ref: InvoiceRef, closingDay: number, dueDay: number): Date {
  const previous = shiftInvoice(ref, -1);
  const previousClosing = closingDateFor(previous, closingDay, dueDay);
  const start = new Date(previousClosing);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

export function shiftInvoice(ref: InvoiceRef, delta: number): InvoiceRef {
  const total = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * Em qual fatura cai uma compra feita nesta data.
 * Compra no dia do fechamento ainda entra na fatura que fecha; a partir do dia
 * seguinte, vai para a próxima.
 */
export function invoiceForPurchase(
  date: Date,
  closingDay: number,
  dueDay: number,
): InvoiceRef {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  // Fatura candidata: a que fecha neste mês.
  const candidate: InvoiceRef = dueDay > closingDay
    ? { year, month }
    : shiftInvoice({ year, month }, 1);

  const closing = closingDateFor(candidate, closingDay, dueDay);
  return date.getTime() <= closing.getTime() ? candidate : shiftInvoice(candidate, 1);
}

export type InvoiceStatus = "aberta" | "fechada" | "paga" | "vencida" | "sem-registro";

/** Depois disso, uma fatura sem pagamento registrado vira histórico, não alerta. */
export const OVERDUE_GRACE_DAYS = 15;

/**
 * Estado da fatura.
 *
 * Faturas antigas sem pagamento registrado viram "sem-registro" em vez de
 * "vencida": quem começa a usar o app hoje tem meses de faturas passadas que
 * já foram pagas na vida real — marcar tudo como vencido seria alarme falso.
 */
export function invoiceStatus(
  ref: InvoiceRef,
  closingDay: number,
  dueDay: number,
  paid: boolean,
  today = new Date(),
): InvoiceStatus {
  if (paid) return "paga";

  const closing = closingDateFor(ref, closingDay, dueDay);
  const due = dueDateFor(ref, dueDay);

  if (today.getTime() <= closing.getTime()) return "aberta";
  if (today.getTime() <= due.getTime()) return "fechada";

  const daysLate = (today.getTime() - due.getTime()) / 86_400_000;
  return daysLate <= OVERDUE_GRACE_DAYS ? "vencida" : "sem-registro";
}

export function invoiceLabel(ref: InvoiceRef): string {
  return `${String(ref.month).padStart(2, "0")}/${ref.year}`;
}

/** Índice absoluto do mês — útil só para comparar duas InvoiceRef. */
function refIndex(ref: InvoiceRef): number {
  return ref.year * 12 + (ref.month - 1);
}

export function compareInvoiceRef(a: InvoiceRef, b: InvoiceRef): number {
  return refIndex(a) - refIndex(b);
}

/**
 * Empurra uma data (mês a mês, mantendo o dia) até ela cair na fatura alvo.
 *
 * Serve para importar uma fatura fechada: o arquivo do banco mostra a data da
 * COMPRA original em cada parcela, não a data em que aquela parcela específica
 * cai. Se a compra foi em 17/07 e esta linha é a 2ª de 12 parcelas, e você está
 * importando a fatura de setembro, a data tem que virar algo dentro do ciclo
 * de setembro — senão o lançamento cai na fatura errada (e nos relatórios do
 * mês errado, já que a data é a mesma coisa que decide as duas coisas).
 *
 * matched: false quando não convergiu (limite de segurança) — a data volta
 * inalterada e quem chamou decide como avisar o usuário.
 */
export function dateWithinInvoice(
  printedDate: Date,
  target: InvoiceRef,
  closingDay: number,
  dueDay: number,
): { date: Date; monthsShifted: number; matched: boolean } {
  let date = printedDate;
  let current = invoiceForPurchase(date, closingDay, dueDay);
  let shifted = 0;

  for (let guard = 0; guard < 48 && compareInvoiceRef(current, target) !== 0; guard++) {
    const direction = compareInvoiceRef(current, target) < 0 ? 1 : -1;
    date = addMonthsKeepingDay(date, direction);
    shifted += direction;
    current = invoiceForPurchase(date, closingDay, dueDay);
  }

  return { date, monthsShifted: shifted, matched: compareInvoiceRef(current, target) === 0 };
}

/** Palavras que costumam identificar o pagamento de uma fatura no extrato. */
export const INVOICE_PAYMENT_HINTS = [
  "pagamento de fatura",
  "pagamento fatura",
  "pgto fatura",
  "pagto fatura",
  "pagamento cartao",
  "pagamento de cartao",
  "fatura cartao",
  "pag fatura",
  "pagamento efetuado cartao",
];
