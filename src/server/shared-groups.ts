import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sharedExpenseShares, sharedExpenses, sharedGroups, sharedMembers, sharedSettlements } from "@/db/schema";
import { calculateGroupBalances, type GroupExpense } from "@/lib/shared-balances";

type Reader = Pick<typeof db, "select">;
export const SHARED_GROUP_PATH = "/contas-a-pagar/grupos";
export const MAX_GROUP_ENTRIES = 2000;
export const GROUP_ID_PATTERN = /^[a-z0-9]{26}$/;

export function ownedGroupCondition(userId: string, groupId: string) {
  return and(eq(sharedGroups.userId, userId), eq(sharedGroups.id, groupId));
}

export async function listSharedGroups(userId: string) {
  return db.select({ id: sharedGroups.id, name: sharedGroups.name }).from(sharedGroups)
    .where(eq(sharedGroups.userId, userId)).orderBy(desc(sharedGroups.createdAt), desc(sharedGroups.id));
}

export function listGroupMembers(reader: Reader, groupId: string) {
  return reader.select({ id: sharedMembers.id, name: sharedMembers.name }).from(sharedMembers)
    .where(eq(sharedMembers.groupId, groupId)).orderBy(asc(sharedMembers.name), asc(sharedMembers.id));
}

/** Called only after the caller has resolved an owned group in the same transaction. */
export async function readSharedLedger(reader: Reader, groupId: string) {
  const [members, expenses, shares, settlements] = await Promise.all([
    listGroupMembers(reader, groupId),
    reader.select({ id: sharedExpenses.id, description: sharedExpenses.description, payerId: sharedExpenses.payerId, amountCents: sharedExpenses.amountCents, createdAt: sharedExpenses.createdAt })
      .from(sharedExpenses).where(eq(sharedExpenses.groupId, groupId)).orderBy(desc(sharedExpenses.createdAt), desc(sharedExpenses.id)),
    reader.select({ expenseId: sharedExpenseShares.expenseId, memberId: sharedExpenseShares.memberId, amountCents: sharedExpenseShares.amountCents })
      .from(sharedExpenseShares).where(eq(sharedExpenseShares.groupId, groupId)),
    reader.select({ id: sharedSettlements.id, fromId: sharedSettlements.fromId, toId: sharedSettlements.toId, amountCents: sharedSettlements.amountCents, createdAt: sharedSettlements.createdAt })
      .from(sharedSettlements).where(eq(sharedSettlements.groupId, groupId)).orderBy(desc(sharedSettlements.createdAt), desc(sharedSettlements.id)),
  ]);
  const byExpense = new Map<string, GroupExpense["shares"]>();
  for (const { expenseId, memberId, amountCents } of shares) {
    const parts = byExpense.get(expenseId) ?? [];
    parts.push({ memberId, amountCents });
    byExpense.set(expenseId, parts);
  }
  const withShares = expenses.map((expense) => ({ ...expense, shares: byExpense.get(expense.id) ?? [] }));
  const result = calculateGroupBalances(members.map((member) => member.id), withShares, settlements);
  return { members, expenses: withShares, settlements, ...result };
}

export async function getSharedGroup(userId: string, groupId: string) {
  if (!GROUP_ID_PATTERN.test(groupId)) return null;
  return db.transaction(async (tx) => {
    const [group] = await tx.select({ id: sharedGroups.id, name: sharedGroups.name }).from(sharedGroups)
      .where(ownedGroupCondition(userId, groupId)).limit(1);
    if (!group) return null;
    return { ...group, ...await readSharedLedger(tx, group.id) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export function isSharedSchemaMissing(error: unknown): boolean {
  for (let depth = 0; depth < 4 && error && typeof error === "object"; depth++) {
    const failure = error as { code?: string; cause?: unknown };
    if (failure.code === "42P01") return true;
    error = failure.cause;
  }
  return false;
}
