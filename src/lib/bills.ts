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
