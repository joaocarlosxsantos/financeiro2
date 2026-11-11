import { and, asc, desc, eq, isNull, lt, or, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";

export function transactionDateOrder(direction: "asc" | "desc") {
  const order = direction === "asc" ? asc : desc;
  return [order(transactions.date), order(transactions.createdAt), order(transactions.id)];
}

export function transactionsInInvoice(ref: string, legacyDateFilter: SQL | undefined) {
  return or(
    eq(transactions.invoiceRef, ref),
    and(isNull(transactions.invoiceRef), legacyDateFilter),
  )!;
}

/** A primeira parcela é a compra. As demais são cobranças das faturas seguintes. */
export function cardPurchasesThrough(civilToday: Date) {
  const tomorrow = new Date(Date.UTC(
    civilToday.getUTCFullYear(), civilToday.getUTCMonth(), civilToday.getUTCDate() + 1,
  ));
  return and(
    lt(transactions.date, tomorrow),
    or(isNull(transactions.installmentNumber), eq(transactions.installmentNumber, 1)),
  );
}
