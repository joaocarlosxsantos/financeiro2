import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth";
import { verifyExportToken, verifyUserPassword } from "@/lib/reauth";
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

async function checkReauth(
  userId: string,
  token?: string | null,
  password?: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (token && verifyExportToken(token, userId)) {
    return { ok: true };
  }

  if (password) {
    const res = await verifyUserPassword(userId, password);
    if (res.ok) return { ok: true };
    return { ok: false, error: res.error ?? "Senha incorreta." };
  }

  return {
    ok: false,
    error: "Reautenticação necessária. Confirme sua senha para baixar o backup de dados.",
  };
}

async function handleBackupDownload(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return new Response("User not found", { status: 404 });

  const [accounts] = await Promise.all([db.select().from(accountsTable).where(eq(accountsTable.userId, userId))]);

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

export async function GET(request: NextRequest) {
  const userId = await requireUserId();
  const sp = request.nextUrl.searchParams;

  const token =
    sp.get("token") ||
    request.headers.get("x-export-token") ||
    request.cookies.get("export-token")?.value;

  // Em requisições GET, nunca aceita senha via query string (evita vazamento em logs/histórico).
  // A senha só pode ser enviada via header seguro ou no corpo de requisições POST.
  const password = request.headers.get("x-reauth-password");

  const authCheck = await checkReauth(userId, token, password);
  if (!authCheck.ok) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  return handleBackupDownload(userId);
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId();

  let token: string | null = null;
  let password: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      token = body.token ?? null;
      password = body.password ?? null;
    } catch {
      // Ignora erro de parse
    }
  } else if (contentType.includes("form")) {
    try {
      const formData = await request.formData();
      token = (formData.get("token") as string) ?? null;
      password = (formData.get("password") as string) ?? null;
    } catch {
      // Ignora erro de parse
    }
  }

  if (!token) {
    token = request.headers.get("x-export-token") || request.cookies.get("export-token")?.value || null;
  }
  if (!password) {
    password = request.headers.get("x-reauth-password") || null;
  }

  const authCheck = await checkReauth(userId, token, password);
  if (!authCheck.ok) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  return handleBackupDownload(userId);
}
