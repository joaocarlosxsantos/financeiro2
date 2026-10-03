import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import {
  users as usersTable,
  accounts as accountsTable,
  categories as categoriesTable,
  transactions as txTable,
  goals as goalsTable,
  goalContributions as goalContributionsTable,
  debts as debtsTable,
  debtPayments as debtPaymentsTable,
  budgets as budgetsTable,
  recurringRules as recurringRulesTable,
  bills as billsTable,
  billParticipants as billParticipantsTable,
  billGroupings as billGroupingsTable,
  transactionSplits as transactionSplitsTable,
} from "@/db/schema";
import { buildBackup } from "@/lib/backup";
import { eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";

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

export async function GET(request: NextRequest) {
  const userId = await requireUserId();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return new Response("User not found", { status: 404 });

  const [accounts] = await Promise.all([db.select().from(accountsTable).where(eq(accountsTable.userId, userId))]);

  const accountIds = accounts.map((a) => a.id);

  const [
    categories,
    transactions,
    goals,
    goalContributions,
    debts,
    debtPayments,
    budgets,
    recurringRules,
    bills,
    billParticipants,
    billGroupings,
  ] = await Promise.all([
    db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId)),
    db.select().from(txTable).where(eq(txTable.userId, userId)),
    db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
    db.select().from(goalContributionsTable).where(
      inArray(
        goalContributionsTable.id,
        db
          .select({ id: goalContributionsTable.id })
          .from(goalContributionsTable)
          .innerJoin(goalsTable, eq(goalsTable.id, goalContributionsTable.goalId))
          .where(eq(goalsTable.userId, userId)),
      ),
    ),
    db.select().from(debtsTable).where(eq(debtsTable.userId, userId)),
    db.select().from(debtPaymentsTable).where(
      inArray(
        debtPaymentsTable.id,
        db
          .select({ id: debtPaymentsTable.id })
          .from(debtPaymentsTable)
          .innerJoin(debtsTable, eq(debtsTable.id, debtPaymentsTable.debtId))
          .where(eq(debtsTable.userId, userId)),
      ),
    ),
    db.select().from(budgetsTable).where(eq(budgetsTable.userId, userId)),
    db.select().from(recurringRulesTable).where(eq(recurringRulesTable.userId, userId)),
    db.select().from(billsTable).where(eq(billsTable.userId, userId)),
    db.select().from(billParticipantsTable).where(
      inArray(
        billParticipantsTable.id,
        db
          .select({ id: billParticipantsTable.id })
          .from(billParticipantsTable)
          .innerJoin(billsTable, eq(billsTable.id, billParticipantsTable.billId))
          .where(eq(billsTable.userId, userId)),
      ),
    ),
    db.select().from(billGroupingsTable).where(eq(billGroupingsTable.userId, userId)),
  ]);

  let transactionSplits: typeof transactionSplitsTable.$inferSelect[] = [];
  try {
    transactionSplits = await db.select().from(transactionSplitsTable).where(eq(transactionSplitsTable.userId, userId));
  } catch (err) {
    if (isTableMissingError(err)) {
      transactionSplits = [];
    } else {
      throw err;
    }
  }

  const backup = buildBackup({
    user: [user],
    accounts,
    categories,
    transactions,
    goals,
    goalContributions,
    debts,
    debtPayments,
    budgets,
    recurringRules,
    bills,
    billParticipants,
    billGroupings,
    transactionSplits,
  });

  const date = new Date().toISOString().split("T")[0];
  const filename = `backup-financeiro-${date}.json`;

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
