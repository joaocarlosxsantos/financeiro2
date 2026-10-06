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

/**
 * Ordena contas do mês:
 * 1. Não pagas primeiro (VENCIDAS e PENDENTES); PAGAS vão para o fim.
 * 2. Entre não pagas: VENCIDAS primeiro, depois por dia de vencimento (menor primeiro, null por último), depois por nome.
 * 3. Entre pagas: por vencimento (menor primeiro, null por último), depois por nome.
 */
export function sortBills<
  T extends { name: string; paid: boolean; dueDay: number | null; year: number; month: number }
>(bills: T[], now: Date = new Date()): T[] {
  return [...bills].sort((a, b) => {
    // 1. Não pagas primeiro, pagas por último
    if (a.paid !== b.paid) {
      return a.paid ? 1 : -1;
    }

    // 2. Entre não pagas: VENCIDAS primeiro
    if (!a.paid && !b.paid) {
      const statusA = getBillStatus(a, now);
      const statusB = getBillStatus(b, now);
      if (statusA === "VENCIDA" && statusB !== "VENCIDA") return -1;
      if (statusB === "VENCIDA" && statusA !== "VENCIDA") return 1;
    }

    // 3. Por dia de vencimento (menor primeiro, null por último)
    if (a.dueDay !== null && b.dueDay !== null) {
      if (a.dueDay !== b.dueDay) return a.dueDay - b.dueDay;
    } else if (a.dueDay !== null && b.dueDay === null) {
      return -1;
    } else if (a.dueDay === null && b.dueDay !== null) {
      return 1;
    }

    // 4. Por nome
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });
}

export type ParticipantShareItem<
  TBill extends { name: string; dueDay: number | null; year: number; month: number } = {
    name: string;
    dueDay: number | null;
    year: number;
    month: number;
  },
  TParticipant extends { paid: boolean } = { paid: boolean }
> = {
  bill: TBill;
  participant: TParticipant;
};

/**
 * Ordena rateios por participante:
 * 1. Pendentes primeiro (participant.paid === false); Pagas por último (participant.paid === true).
 * 2. Entre pendentes: VENCIDAS primeiro, depois por dia de vencimento (menor primeiro, null por último), depois por nome da conta.
 * 3. Entre pagas: por vencimento (menor primeiro, null por último), depois por nome da conta.
 */
export function sortParticipantShares<T extends ParticipantShareItem>(
  shares: T[],
  now: Date = new Date(),
): T[] {
  return [...shares].sort((a, b) => {
    // 1. Pendentes primeiro (participant.paid === false); Pagas por último (participant.paid === true)
    if (a.participant.paid !== b.participant.paid) {
      return a.participant.paid ? 1 : -1;
    }

    // 2. Entre pendentes: VENCIDAS primeiro
    if (!a.participant.paid && !b.participant.paid) {
      const statusA = getBillStatus(
        { paid: a.participant.paid, dueDay: a.bill.dueDay, year: a.bill.year, month: a.bill.month },
        now,
      );
      const statusB = getBillStatus(
        { paid: b.participant.paid, dueDay: b.bill.dueDay, year: b.bill.year, month: b.bill.month },
        now,
      );
      if (statusA === "VENCIDA" && statusB !== "VENCIDA") return -1;
      if (statusB === "VENCIDA" && statusA !== "VENCIDA") return 1;
    }

    // 3. Por dia de vencimento (menor primeiro, null por último)
    if (a.bill.dueDay !== null && b.bill.dueDay !== null) {
      if (a.bill.dueDay !== b.bill.dueDay) return a.bill.dueDay - b.bill.dueDay;
    } else if (a.bill.dueDay !== null && b.bill.dueDay === null) {
      return -1;
    } else if (a.bill.dueDay === null && b.bill.dueDay !== null) {
      return 1;
    }

    // 4. Por nome da conta (localeCompare pt-BR)
    return a.bill.name.localeCompare(b.bill.name, "pt-BR", { sensitivity: "base" });
  });
}

