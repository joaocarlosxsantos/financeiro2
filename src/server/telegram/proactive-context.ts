import { and, eq, exists, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, openFinanceConnections, users } from "@/db/schema";
import { invoiceCycle } from "@/lib/invoices";
import type { InsightData } from "./insights";

/** Existing account/connection fields only. No provider error text is selected. */
export async function loadProactiveContext(userId: string, day: string, connection: Pick<typeof db, "select"> = db) {
  const [cards, problems] = await Promise.all([
    connection.select({ id: accounts.id, name: accounts.name, closingDay: accounts.closingDay })
      .from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.type, "CREDIT_CARD"), eq(accounts.archived, false))),
    connection.select({ id: openFinanceConnections.id }).from(openFinanceConnections)
      .innerJoin(users, eq(users.id, openFinanceConnections.userId))
      .where(and(eq(openFinanceConnections.userId, userId), sql`${users.usageProfile} <> 'manual'`,
        or(eq(openFinanceConnections.status, "ERROR"), eq(openFinanceConnections.status, "LOGIN_ERROR"),
          eq(openFinanceConnections.status, "OUTDATED"), eq(openFinanceConnections.status, "WAITING_USER_INPUT"), isNotNull(openFinanceConnections.lastErrorCode)),
        exists(connection.select({ id: accounts.id }).from(accounts).where(and(
          eq(accounts.userId, userId), eq(accounts.externalConnectionId, openFinanceConnections.id),
          eq(accounts.archived, false), eq(accounts.financeMode, "integracao")))))).limit(1),
  ]);
  // day is an already-resolved São Paulo civil date; noon UTC preserves that day.
  const today = new Date(`${day}T12:00:00.000Z`);
  const cardClosings: NonNullable<InsightData["cardClosings"]> = [];
  for (const card of cards) {
    if (!card.closingDay) continue;
    try {
      const closing = invoiceCycle(today, card.closingDay, 1).closesOn;
      const diffDays = Math.round((closing.getTime() - today.getTime()) / 86_400_000);
      if (diffDays === 0 || diffDays === 1) cardClosings.push({ id: card.id, cardName: card.name, closingDate: closing.toISOString().slice(0, 10), diffDays });
    } catch { /* Invalid legacy closing days do not block other cards. */ }
  }
  return { cardClosings, syncProblem: problems.length > 0 };
}
