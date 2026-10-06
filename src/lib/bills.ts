/**
 * Regras puras de divisão de conta em grupo — sem banco, testável isolada.
 *
 * Duas formas de dividir o valor total entre as pessoas: igualmente (mesma
 * lógica de `splitInstallments`, reaproveitada — não perde centavo, as
 * primeiras pessoas absorvem o resto) ou manualmente, e nesse caso a soma dos
 * valores digitados precisa bater exatamente com o total: nem faltar, nem
 * passar. É a regra que o João pediu.
 */
import { splitInstallments } from "./installments";
import { getNowInSaoPaulo } from "./dates";

/** Divide o valor entre N pessoas sem perder centavo. */
export function splitBillEqually(totalCents: number, count: number): number[] {
  return splitInstallments(totalCents, count);
}

export type SplitCheck = {
  ok: boolean;
  /** Positivo = falta dividir esse tanto ainda. Negativo = passou do total. */
  remainingCents: number;
};

/** A soma dos valores manuais bate exatamente com o total? */
export function checkManualSplit(totalCents: number, amountsCents: number[]): SplitCheck {
  const sum = amountsCents.reduce((acc, v) => acc + v, 0);
  const remainingCents = totalCents - sum;
  return { ok: remainingCents === 0, remainingCents };
}

/**
 * Recalcula a divisão após adicionar/remover participante.
 * Recebe os valores ANTES da mudança, o novo número de participantes,
 * e opcionalmente o índice do removido (para remoção manual).
 * Se a divisão anterior era igual: redistribui igualmente todos.
 * Se era manual: mantém valores antigos, novo participante = 0, remove = filtra o removido.
 */
export function recalculateSplit(
  totalCents: number,
  oldAmounts: number[],
  newCount: number,
  removedIndex?: number
): number[] {
  if (newCount <= 0) return [];
  const oldCount = oldAmounts.length;
  const expectedEqual = splitBillEqually(totalCents, oldCount);
  const wasEqual = oldAmounts.every((amt, i) => amt === expectedEqual[i]);
  if (wasEqual) {
    return splitBillEqually(totalCents, newCount);
  }
  if (newCount > oldCount) {
    return [...oldAmounts, ...new Array(newCount - oldCount).fill(0)];
  }
  if (removedIndex !== undefined && removedIndex >= 0 && removedIndex < oldCount) {
    return oldAmounts.filter((_, i) => i !== removedIndex);
  }
  return oldAmounts.slice(0, newCount);
}

export type BillStatus = "PAGA" | "VENCIDA" | "PENDENTE";

/**
 * Retorna o status de uma conta a pagar ('PAGA', 'VENCIDA' ou 'PENDENTE').
 * - Se bill.paid -> 'PAGA'
 * - Se ano < now.ano ou (ano == now.ano e mes < now.mes) -> 'VENCIDA'
 * - Se ano == now.ano e mes == now.mes e dueDay != null e now.dia > dueDay -> 'VENCIDA'
 * - Caso contrário -> 'PENDENTE'
 */
export function getBillStatus(
  bill: { paid: boolean; dueDay: number | null; year: number; month: number },
  now: Date = new Date(),
): BillStatus {
  if (bill.paid) return "PAGA";

  const spDate = getNowInSaoPaulo(now);
  const nowYear = spDate.getFullYear();
  const nowMonth = spDate.getMonth() + 1;
  const nowDay = spDate.getDate();

  if (bill.year < nowYear || (bill.year === nowYear && bill.month < nowMonth)) {
    return "VENCIDA";
  }

  if (bill.dueDay != null) {
    const lastDayOfMonth = new Date(bill.year, bill.month, 0).getDate();
    const effectiveDueDay = Math.min(bill.dueDay, lastDayOfMonth);
    if (bill.year === nowYear && bill.month === nowMonth && nowDay > effectiveDueDay) {
      return "VENCIDA";
    }
  }

  return "PENDENTE";
}
