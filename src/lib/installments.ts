/**
 * Regras puras de parcelamento e de datas de recorrência.
 * Sem acesso a banco — pode ser importado por componentes de cliente.
 */
import type { MonthRef } from "./dates";

/** Meses curtos: o dia 31 vira o último dia disponível. */
export function dateForMonth(ref: MonthRef, dayOfMonth: number): Date {
  const lastDay = new Date(ref.year, ref.month, 0).getDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(Date.UTC(ref.year, ref.month - 1, day, 12));
}

/**
 * Divide um valor em N parcelas sem perder centavo.
 * As primeiras parcelas absorvem o resto — é o que a fatura do cartão faz.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Mesma data em meses seguintes, respeitando meses mais curtos. */
export function addMonthsKeepingDay(base: Date, monthsAhead: number): Date {
  const target = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthsAhead, 1, 12),
  );
  const lastDay = new Date(target.getUTCFullYear(), target.getUTCMonth() + 1, 0).getDate();
  target.setUTCDate(Math.min(base.getUTCDate(), lastDay));
  return target;
}
