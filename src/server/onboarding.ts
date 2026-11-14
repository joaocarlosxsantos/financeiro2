import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, budgets, inAppNotifications, openFinanceConnections, openFinanceCredentials, pushSubscriptions, telegramLinks, transactions, userNotificationPreferences, users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { todayRef } from "@/lib/dates";
import { deriveOnboardingJourney, onboardingStorageKey, type IntegrationProgress, type OnboardingFacts } from "@/lib/onboarding";
import { isUsageProfile } from "@/lib/usage-profile";

type ConnectionFact = { status: string; lastSyncedAt: Date | null; lastAttemptAt: Date | null; hasError: boolean; linkedAccounts: number };
export function connectionOnboardingStatus(connection: ConnectionFact): IntegrationProgress {
  if (connection.status === "SYNCING" || connection.status === "UPDATING" || connection.status === "LOGIN_IN_PROGRESS") return "syncing";
  if (connection.hasError || ["ERROR", "LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT", "UNKNOWN"].includes(connection.status)) return "error";
  if (!connection.linkedAccounts) return "needs_accounts";
  const synced = connection.lastSyncedAt?.getTime();
  if (connection.status === "UPDATED" && synced !== undefined && Number.isFinite(synced)
    && (!connection.lastAttemptAt || synced >= connection.lastAttemptAt.getTime())) return "complete";
  return "pending";
}

/** Trusted server caller supplies owner. Read-only projections intentionally exclude every secret envelope/token. */
export async function loadOnboardingFacts(userId: string, connection: Pick<typeof db, "select"> = db, now = new Date()): Promise<OnboardingFacts> {
  const [user] = await connection.select({ profile: users.usageProfile, onboardedAt: users.onboardedAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !isUsageProfile(user.profile)) throw new Error("onboarding_owner_unavailable");
  const tomorrow = new Date(`${todayRef(now)}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const [accountRows, transactionRows, credentials, connectionRows, budgetRows, prefsRows, pushRows, telegramRows, summaryRows] = await Promise.all([
    connection.select({ id: accounts.id, financeMode: accounts.financeMode, connectionId: accounts.externalConnectionId,
      linked: sql<boolean>`${accounts.externalAccountId} is not null`,
    }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.archived, false))),
    connection.select({ origin: transactions.origin }).from(transactions)
      .innerJoin(accounts, and(eq(accounts.id, transactions.accountId), eq(accounts.userId, userId)))
      .where(and(eq(transactions.userId, userId), eq(accounts.archived, false), eq(transactions.isTransfer, false), eq(transactions.isCardPayment, false),
        or(isNull(transactions.externalStatus), eq(transactions.externalStatus, "POSTED")), lt(transactions.date, tomorrow)))
      .groupBy(transactions.origin),
    connection.select({ configured: sql<boolean>`true` }).from(openFinanceCredentials).where(eq(openFinanceCredentials.userId, userId)).limit(1),
    connection.select({ id: openFinanceConnections.id, status: openFinanceConnections.status, lastAttemptAt: openFinanceConnections.lastAttemptAt,
      lastSyncedAt: openFinanceConnections.lastSyncedAt, hasError: sql<boolean>`${openFinanceConnections.lastErrorCode} is not null`,
    }).from(openFinanceConnections).where(eq(openFinanceConnections.userId, userId)),
    connection.select({ id: budgets.id }).from(budgets).where(eq(budgets.userId, userId)).limit(1),
    connection.select({ inAppEnabled: userNotificationPreferences.channelInApp, pushEnabled: userNotificationPreferences.channelPush,
      telegramEnabled: userNotificationPreferences.channelTelegram,
    }).from(userNotificationPreferences).where(eq(userNotificationPreferences.userId, userId)).limit(1),
    connection.select({ configured: sql<boolean>`true` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1),
    connection.select({ linked: sql<boolean>`true` }).from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1),
    connection.select({ id: inAppNotifications.id }).from(inAppNotifications).where(and(eq(inAppNotifications.userId, userId),
      eq(inAppNotifications.visible, true), isNotNull(inAppNotifications.readAt), inArray(inAppNotifications.type, ["DAILY_SUMMARY", "WEEKLY_SUMMARY", "MONTHLY_SUMMARY"]))).limit(1),
  ]);
  const connections = connectionRows.map(row => ({ ...row, linkedAccounts: accountRows.filter(a => a.financeMode === "integracao" && a.linked && a.connectionId === row.id).length }));
  const statuses = connections.map(connectionOnboardingStatus);
  const syncedConnections = statuses.filter(s => s === "complete").length;
  const status: IntegrationProgress = !statuses.length ? "not_started" : syncedConnections === statuses.length ? "complete"
    : syncedConnections > 0 ? "partial" : statuses.includes("error") ? "error" : statuses.includes("syncing") ? "syncing"
      : statuses.includes("needs_accounts") ? "needs_accounts" : "pending";
  return {
    registered: true, profile: user.profile, modeChosen: Boolean(user.onboardedAt), hasAccount: accountRows.length > 0,
    hasTransaction: transactionRows.length > 0,
    hasManualTransaction: transactionRows.some(t => t.origin === "MANUAL" || t.origin === "CSV" || t.origin === "OFX"),
    credentialConfigured: credentials.length > 0,
    integration: { status, connections: connections.length, linkedAccounts: connections.reduce((n, c) => n + c.linkedAccounts, 0), syncedConnections },
    hasBudget: budgetRows.length > 0,
    notifications: { decided: prefsRows.length > 0, inAppEnabled: prefsRows[0]?.inAppEnabled ?? false, pushEnabled: prefsRows[0]?.pushEnabled ?? false,
      telegramEnabled: prefsRows[0]?.telegramEnabled ?? false, pushRegisteredOnAnyDevice: pushRows.length > 0, telegramLinked: telegramRows.length > 0 },
    hasReadSummary: summaryRows.length > 0,
  };
}

/** Public entry never accepts an owner ID or browser-supplied completion flags. */
export async function getOnboardingJourney() {
  const userId = await requireUserId();
  return { ...deriveOnboardingJourney(await loadOnboardingFacts(userId)), storageKey: onboardingStorageKey(userId) };
}
