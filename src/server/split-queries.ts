import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  bills as billsTable,
  billParticipants as billParticipantsTable,
  transactions as txTable,
  transactionSplits as transactionSplitsTable,
} from "@/db/schema";
import { monthRange, type MonthRef } from "@/lib/dates";

export type TransactionSplitRow = {
  id: string;
  transactionId: string;
  name: string;
  phone: string | null;
  amountCents: number;
  createdAt: Date;
};

export type PersonReceivable = {
  name: string;
  phone: string | null;
  totalCents: number;
  splitCents: number;
  billCents: number;
  count: number;
};

// ponytail: remover este fallback depois que migration 0011 estiver aplicada em producao
let migrationWarned = false;
function warnMigrationPending() {
  if (!migrationWarned) {
    migrationWarned = true;
    console.warn("migration 0011 pendente");
  }
}

function isTableMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  if (e.code === "42P01") return true;
  if (e.cause && typeof e.cause === "object") {
    const cause = e.cause as Record<string, unknown>;
    if (cause.code === "42P01") return true;
    if (cause.cause && typeof cause.cause === "object" && (cause.cause as Record<string, unknown>).code === "42P01") {
      return true;
    }
  }
  return false;
}

/**
 * Busca as divisões das transações informadas em uma única query (sem N+1).
 * Retorna um Map onde a chave é o transactionId e o valor é a lista de divisões.
 */
export async function getTransactionSplits(
  userId: string,
  transactionIds: string[],
): Promise<Map<string, TransactionSplitRow[]>> {
  const result = new Map<string, TransactionSplitRow[]>();
  if (!transactionIds.length) return result;

  try {
    const rows = await db
      .select({
        id: transactionSplitsTable.id,
        transactionId: transactionSplitsTable.transactionId,
        name: transactionSplitsTable.name,
        phone: transactionSplitsTable.phone,
        amountCents: transactionSplitsTable.amountCents,
        createdAt: transactionSplitsTable.createdAt,
      })
      .from(transactionSplitsTable)
      .where(
        and(
          eq(transactionSplitsTable.userId, userId),
          inArray(transactionSplitsTable.transactionId, transactionIds),
        ),
      )
      .orderBy(asc(transactionSplitsTable.createdAt), asc(transactionSplitsTable.id));

    for (const row of rows) {
      const list = result.get(row.transactionId) ?? [];
      list.push(row);
      result.set(row.transactionId, list);
    }

    return result;
  } catch (err) {
    // ponytail: remover este fallback depois que migration 0011 estiver aplicada em producao
    if (isTableMissingError(err)) {
      warnMigrationPending();
      return result;
    }
    throw err;
  }
}

/**
 * Busca as divisões de uma única transação.
 */
export async function getTransactionSplitsByTransactionId(
  userId: string,
  transactionId: string,
): Promise<TransactionSplitRow[]> {
  const map = await getTransactionSplits(userId, [transactionId]);
  return map.get(transactionId) ?? [];
}

/**
 * Agregado "a receber por pessoa" no mês selecionado:
 * Soma transaction_splits + bill_participants das CONTAS EM GRUPO do usuário no mês.
 * Agrupa por nome normalizado (trim + lower), exibindo o primeiro nome gravado.
 * Somente leitura, sem status de pago.
 */
export async function getReceivablesByPerson(
  userId: string,
  ref: MonthRef,
): Promise<PersonReceivable[]> {
  try {
    const range = monthRange(ref);

    const [splitRows, billRows] = await Promise.all([
      // transaction_splits do mês da transação
      db
        .select({
          name: transactionSplitsTable.name,
          phone: transactionSplitsTable.phone,
          amountCents: transactionSplitsTable.amountCents,
        })
        .from(transactionSplitsTable)
        .innerJoin(txTable, eq(txTable.id, transactionSplitsTable.transactionId))
        .where(
          and(
            eq(transactionSplitsTable.userId, userId),
            gte(txTable.date, range.start),
            lt(txTable.date, range.end),
          ),
        ),

      // bill_participants de contas em grupo do mês selecionado
      db
        .select({
          name: billParticipantsTable.name,
          phone: billParticipantsTable.phone,
          amountCents: billParticipantsTable.amountCents,
        })
        .from(billParticipantsTable)
        .innerJoin(billsTable, eq(billsTable.id, billParticipantsTable.billId))
        .where(
          and(
            eq(billsTable.userId, userId),
            eq(billsTable.type, "GROUP"),
            eq(billsTable.year, ref.year),
            eq(billsTable.month, ref.month),
          ),
        ),
    ]);

    const map = new Map<
      string,
      {
        name: string;
        phone: string | null;
        totalCents: number;
        splitCents: number;
        billCents: number;
        count: number;
      }
    >();

    for (const s of splitRows) {
      const trimmed = s.name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.totalCents += s.amountCents;
        existing.splitCents += s.amountCents;
        existing.count += 1;
        if (!existing.phone && s.phone) existing.phone = s.phone.trim();
      } else {
        map.set(key, {
          name: trimmed, // Primeiro nome gravado
          phone: s.phone ? s.phone.trim() : null,
          totalCents: s.amountCents,
          splitCents: s.amountCents,
          billCents: 0,
          count: 1,
        });
      }
    }

    for (const b of billRows) {
      const trimmed = b.name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.totalCents += b.amountCents;
        existing.billCents += b.amountCents;
        existing.count += 1;
        if (!existing.phone && b.phone) existing.phone = b.phone.trim();
      } else {
        map.set(key, {
          name: trimmed, // Primeiro nome gravado
          phone: b.phone ? b.phone.trim() : null,
          totalCents: b.amountCents,
          splitCents: 0,
          billCents: b.amountCents,
          count: 1,
        });
      }
    }

    // Ordena por maior valor a receber total, depois por nome
    return Array.from(map.values()).sort(
      (a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, "pt-BR"),
    );
  } catch (err) {
    // ponytail: remover este fallback depois que migration 0011 estiver aplicada em producao
    if (isTableMissingError(err)) {
      warnMigrationPending();
      return [];
    }
    throw err;
  }
}
