import { and, eq, exists, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, openFinanceConnections } from "@/db/schema";
import { getProfileRestriction } from "@/server/usage-profile";
import { syncOpenFinanceForUser } from "./sync";

// Alinhado ao AbortSignal.timeout(12s) de cada chamada HTTP do client Pluggy.
export const FINANCIAL_REFRESH_TIMEOUT_MS = 12_000;
const STALE_DATA_MS = 2 * 60 * 60 * 1000;
type Snapshot = { id: string; lastSyncedAt: Date | null; dataAt: Date | null };
export interface FinancialRefreshDependencies {
  connections(userId: string, signal: AbortSignal): Promise<Snapshot[]>;
  sync(userId: string, connectionId: string, signal: AbortSignal): Promise<{
    skipped?: boolean;
    error?: string;
    lastSyncedAt?: Date | null;
    dataAt?: Date | null;
    itemUpdate?: "updated" | "pending" | "unavailable" | "skipped";
    notice?: string;
  }>;
  now(): Date;
}

const dependencies: FinancialRefreshDependencies = {
  async connections(userId, signal) {
    if (await getProfileRestriction(userId, "integration")) return [];
    signal.throwIfAborted();
    const rows = await db.select({ id: openFinanceConnections.id, lastSyncedAt: openFinanceConnections.lastSyncedAt })
      .from(openFinanceConnections).where(and(eq(openFinanceConnections.userId, userId), exists(
        db.select({ id: accounts.id }).from(accounts).where(and(
          eq(accounts.userId, userId), eq(accounts.externalConnectionId, openFinanceConnections.id),
          eq(accounts.financeMode, "integracao"), eq(accounts.archived, false),
        )),
      )));
    signal.throwIfAborted();
    if (!rows.length) return [];
    const dataRows = await db.select({
      connectionId: accounts.externalConnectionId,
      bankBalanceAt: accounts.bankBalanceAt,
      creditSnapshotAt: accounts.creditSnapshotAt,
    }).from(accounts).where(and(
      eq(accounts.userId, userId), eq(accounts.financeMode, "integracao"), eq(accounts.archived, false),
      inArray(accounts.externalConnectionId, rows.map((row) => row.id)),
    ));
    signal.throwIfAborted();
    return rows.map((row) => {
      const dates = dataRows
        .filter((data) => data.connectionId === row.id)
        .map((data) => data.bankBalanceAt ?? data.creditSnapshotAt)
        .filter((date): date is Date => date instanceof Date);
      return { ...row, dataAt: dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null };
    });
  },
  // O mesmo núcleo do botão e painel possui o único cooldown/claim persistido.
  // Leituras automáticas usam o cooldown de 5 min e reaproveitam lastAttemptAt.
  sync: (userId, connectionId, signal) => syncOpenFinanceForUser(userId, connectionId, "auto", { signal }),
  now: () => new Date(),
};

const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

function ageLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h`;
}

/** Horário do dado do banco (snapshot importado), nunca o horário da última tentativa de sync. */
function dataSnapshot(rows: Snapshot[]): Date | null {
  if (!rows.length) return null;
  const dates = rows.map((row) => row.dataAt ?? row.lastSyncedAt);
  if (dates.some((date) => !date)) return null;
  return new Date(Math.min(...dates.map((date) => date!.getTime())));
}

function dataLabel(rows: Snapshot[]): string {
  const date = dataSnapshot(rows);
  return date
    ? `dados de ${timeFormat.format(date)} (${dayMonthFormat.format(date)})`
    : "dados salvos, sem horário de atualização disponível";
}

function failureNotice(rows: Snapshot[]): string {
  return `Não consegui atualizar agora; ${dataLabel(rows)}. Os dados podem estar desatualizados.`;
}

/** Teto global por usuário, incluindo todas as conexões, sem bloquear a leitura salva. */
export async function refreshFinancialData(userId: string, deps = dependencies): Promise<string | null> {
  const controller = new AbortController();
  let snapshots: Snapshot[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(failureNotice(snapshots));
    }, FINANCIAL_REFRESH_TIMEOUT_MS);
  });
  const work = (async () => {
    snapshots = await deps.connections(userId, controller.signal);
    if (!snapshots.length) return null;
    let failed = false;
    let updated = false;
    let processing: "pending" | "unavailable" | null = null;
    for (const row of snapshots) {
      controller.signal.throwIfAborted();
      try {
        const result = await deps.sync(userId, row.id, controller.signal);
        if (result.skipped) {
          // Cooldown não é sucesso: segue sem afirmar que buscou dados novos.
        } else if (result.error) failed = true;
        else updated = true;
        if (result.itemUpdate === "pending") processing = "pending";
        else if (result.itemUpdate === "unavailable" && processing !== "pending") processing = "unavailable";
        if (result.lastSyncedAt) row.lastSyncedAt = result.lastSyncedAt;
        if (result.dataAt) row.dataAt = result.dataAt;
      } catch {
        failed = true;
      }
    }
    if (failed) return failureNotice(snapshots);
    const date = dataSnapshot(snapshots);
    if (processing) {
      const prefix = processing === "pending" ? "O banco ainda está processando a atualização" : "Não consegui solicitar atualização ao banco";
      return date
        ? `${prefix}; dados de ${timeFormat.format(date)} (${dayMonthFormat.format(date)}).`
        : `${prefix}; horário do dado do banco indisponível.`;
    }
    if (!updated) {
      return date ? `Nada novo desde ${timeFormat.format(date)} (${dayMonthFormat.format(date)}).`
        : "Nada novo; horário do dado do banco indisponível.";
    }
    if (!date) return "Dados salvos; horário da última atualização indisponível.";
    const seconds = Math.max(0, Math.floor((deps.now().getTime() - date.getTime()) / 1000));
    return seconds * 1000 > STALE_DATA_MS
      ? `Dados do banco de ${timeFormat.format(date)} (${dayMonthFormat.format(date)}); podem estar desatualizados.`
      : `Atualizado há ${ageLabel(seconds)}.`;
  })();
  try { return await Promise.race([work, timeout]); }
  catch { return failureNotice(snapshots); }
  finally { if (timer) clearTimeout(timer); }
}

export function appendRefreshNotice(text: string, notice: string | null): string {
  if (!notice) return text;
  let content = text.slice(0, 4096 - notice.length - 2);
  if (/[\uD800-\uDBFF]$/.test(content)) content = content.slice(0, -1);
  return `${content}\n\n${notice}`;
}

export async function readWithOpenFinanceRefresh(userId: string, read: () => Promise<string>, deps?: FinancialRefreshDependencies): Promise<string> {
  const notice = await refreshFinancialData(userId, deps);
  return appendRefreshNotice(await read(), notice);
}
