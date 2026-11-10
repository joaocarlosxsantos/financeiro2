import { MAX_CENTS } from "./money";
import { computeSplit } from "./splits";

export type GroupShare = { memberId: string; amountCents: number };
export type GroupExpense = { payerId: string; amountCents: number; shares: GroupShare[] };
export type GroupPayment = { fromId: string; toId: string; amountCents: number };

function validAmount(cents: number, min = 1) {
  return Number.isSafeInteger(cents) && cents >= min && cents <= MAX_CENTS;
}

export function allocateGroupExpense(
  amountCents: number,
  mode: "EQUAL" | "VALUE",
  members: { memberId: string; name: string; amountCents?: number }[],
): { ok: true; shares: GroupShare[] } | { ok: false; error: string } {
  if (!validAmount(amountCents)) return { ok: false, error: "Informe um total válido em reais." };
  if (members.length < 2 || new Set(members.map(({ memberId }) => memberId)).size !== members.length) {
    return { ok: false, error: "Selecione ao menos duas pessoas diferentes." };
  }
  if (mode === "VALUE" && members.some((member) => !validAmount(member.amountCents ?? NaN, 0))) {
    return { ok: false, error: "Informe o valor de cada parte em reais." };
  }
  const result = computeSplit(amountCents, mode, members.map((member) => ({ name: member.name, amount: member.amountCents })), false);
  if (!result.ok) return { ok: false, error: mode === "VALUE" ? "A soma das partes deve ser igual ao total." : result.error };
  return { ok: true, shares: result.amounts.map((part, index) => ({ memberId: members[index].memberId, amountCents: part.amountCents })) };
}

export function calculateGroupBalances(memberIds: string[], expenses: GroupExpense[], payments: GroupPayment[]) {
  const totals = new Map(memberIds.map((id) => [id, 0]));
  if (totals.size !== memberIds.length) throw new Error("Participante repetido no grupo.");

  function adjust(id: string, delta: number) {
    const previous = totals.get(id);
    if (previous === undefined || !Number.isSafeInteger(previous + delta)) throw new Error("Saldo do grupo inconsistente.");
    totals.set(id, previous + delta);
  }

  for (const expense of expenses) {
    const parts = expense.shares;
    if (!validAmount(expense.amountCents) || parts.some((part) => !validAmount(part.amountCents, 0)) ||
      new Set(parts.map((part) => part.memberId)).size !== parts.length ||
      parts.reduce((sum, part) => sum + part.amountCents, 0) !== expense.amountCents) {
      throw new Error("Rateio do grupo inconsistente.");
    }
    adjust(expense.payerId, expense.amountCents);
    for (const part of parts) adjust(part.memberId, -part.amountCents);
  }

  for (const payment of payments) {
    if (!validAmount(payment.amountCents) || payment.fromId === payment.toId) throw new Error("Acerto do grupo inconsistente.");
    adjust(payment.fromId, payment.amountCents);
    adjust(payment.toId, -payment.amountCents);
  }

  const balances = [...totals].map(([memberId, balanceCents]) => ({ memberId, balanceCents }));
  const debtors = balances.filter((row) => row.balanceCents < 0).map((row) => ({ id: row.memberId, remaining: -row.balanceCents }));
  const creditors = balances.filter((row) => row.balanceCents > 0).map((row) => ({ id: row.memberId, remaining: row.balanceCents }));
  const debts: GroupPayment[] = [];
  let nextCreditor = 0;
  for (const debtor of debtors) {
    while (debtor.remaining > 0) {
      const creditor = creditors[nextCreditor];
      const amountCents = Math.min(debtor.remaining, creditor.remaining);
      debts.push({ fromId: debtor.id, toId: creditor.id, amountCents });
      debtor.remaining -= amountCents;
      creditor.remaining -= amountCents;
      if (creditor.remaining === 0) nextCreditor++;
    }
  }
  return { balances, debts };
}

export function canSettle(debts: GroupPayment[], payment: GroupPayment) {
  return validAmount(payment.amountCents) && payment.fromId !== payment.toId && debts.some((debt) =>
    debt.fromId === payment.fromId && debt.toId === payment.toId && payment.amountCents <= debt.amountCents,
  );
}
