import { MAX_CENTS } from "./money";

export type TransferLeg = {
  accountId: string;
  amountCents: number;
  kind: "EXPENSE" | "INCOME";
  nature: "VARIABLE";
  date: Date;
  description: string;
  notes: string | null;
  isTransfer: true;
  transferGroupId: string;
  fingerprint: string;
};

export type TransferLegsResult = [TransferLeg, TransferLeg];

/**
 * Cria o par de lançamentos que compõem uma transferência:
 * - Perna de saída (EXPENSE): conta de origem (from)
 * - Perna de entrada (INCOME): conta de destino (to)
 *
 * Ambas as pernas têm mesmo valor, mesma data, isTransfer=true,
 * e fingerprints exclusivos vinculados ao groupId.
 */
export function transferLegs(
  from: string,
  to: string,
  amountCents: number,
  date: Date,
  note?: string | null,
  groupId?: string,
): TransferLegsResult {
  if (!from || !to) {
    throw new Error("Contas de origem e destino são obrigatórias.");
  }

  if (from === to) {
    throw new Error("Contas de origem e destino devem ser diferentes.");
  }

  if (
    typeof amountCents !== "number" ||
    !Number.isFinite(amountCents) ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new Error("O valor da transferência deve ser um número inteiro de centavos positivo.");
  }

  if (amountCents > MAX_CENTS) {
    throw new Error(`O valor da transferência não pode exceder ${MAX_CENTS} centavos.`);
  }

  if (!groupId || typeof groupId !== "string" || groupId.trim() === "") {
    throw new Error("ID do grupo de transferência é obrigatório.");
  }

  const cleanGroupId = groupId.trim();
  const description = note?.trim() || "Transferência";
  const notes = note ?? null;

  const outgoing: TransferLeg = {
    accountId: from,
    amountCents,
    kind: "EXPENSE",
    nature: "VARIABLE",
    date,
    description,
    notes,
    isTransfer: true,
    transferGroupId: cleanGroupId,
    fingerprint: `xfer:${cleanGroupId}|out`,
  };

  const incoming: TransferLeg = {
    accountId: to,
    amountCents,
    kind: "INCOME",
    nature: "VARIABLE",
    date,
    description,
    notes,
    isTransfer: true,
    transferGroupId: cleanGroupId,
    fingerprint: `xfer:${cleanGroupId}|in`,
  };

  return [outgoing, incoming];
}
