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

export type InstallmentMarker = { number: number; total: number };

// "parcela 2/12", "parc 02 de 12", "2/12" no fim da descrição.
const EXPLICIT_RE = /parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i;
const TRAILING_RE = /(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})\s*$/;

/**
 * Identifica "parcela N de T" numa descrição de extrato/fatura importada.
 *
 * Heurística, igual à categorização automática: bancos não têm um formato
 * único. Prioriza um marcador explícito ("parcela"/"parc"); sem isso, só
 * aceita "N/T" no FINAL da descrição (formato comum tipo "UBER 3/10") — e só
 * quando N ≤ T e T é um número plausível de parcelas, pra não confundir com
 * uma data (17/07) que sobrou de uma coluna mal separada.
 */
export function parseInstallmentMarker(description: string): InstallmentMarker | null {
  const explicit = description.match(EXPLICIT_RE);
  const match = explicit ?? description.match(TRAILING_RE);
  if (!match) return null;

  const number = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (!Number.isFinite(number) || !Number.isFinite(total)) return null;
  if (number < 1 || total < 2 || number > total || total > 60) return null;

  return { number, total };
}
