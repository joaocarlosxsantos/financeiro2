import { and, eq, exists } from "drizzle-orm";
import { db } from "@/db";
import { accounts, openFinanceConnections } from "@/db/schema";
import { getProfileRestriction } from "@/server/usage-profile";
import { syncOpenFinanceForUser } from "./sync";

export const FINANCIAL_REFRESH_TIMEOUT_MS = 8_000;
type Snapshot = { id: string; lastSyncedAt: Date | null };
export interface FinancialRefreshDependencies {
  connections(userId: string, signal: AbortSignal): Promise<Snapshot[]>;
  sync(userId: string, connectionId: string, signal: AbortSignal): Promise<{ skipped?: boolean; error?: string; lastSyncedAt?: Date | null }>;
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
    return rows;
  },
  // O mesmo núcleo do botão e painel possui o único cooldown/claim persistido.
  // Leituras automáticas usam o cooldown de 5 min e reaproveitam lastAttemptAt.
  sync: (userId, connectionId, signal) => syncOpenFinanceForUser(userId, connectionId, "auto", { signal }),
  now: () => new Date(),
};

function oldestSnapshot(rows: Snapshot[]): Date | null {
  if (!rows.length || rows.some(row => !row.lastSyncedAt)) return null;
  return new Date(Math.min(...rows.map(row => row.lastSyncedAt!.getTime())));
}

function failureNotice(rows: Snapshot[]): string {
  const date = oldestSnapshot(rows);
  const when = date ? `dados de ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(date)} (${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(date)})`
    : "dados salvos, sem horário de atualização disponível";
  return `Não consegui atualizar agora; ${when}. Os dados podem estar desatualizados.`;
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
    for (const row of snapshots) {
      controller.signal.throwIfAborted();
      try {
        const result = await deps.sync(userId, row.id, controller.signal);
        if (!result.skipped && result.error) failed = true;
        if (result.lastSyncedAt) row.lastSyncedAt = result.lastSyncedAt;
      } catch {
        failed = true;
      }
    }
    if (failed) return failureNotice(snapshots);
    const date = oldestSnapshot(snapshots);
    if (!date) return "Dados salvos; horário da última atualização indisponível.";
    const seconds = Math.max(0, Math.floor((deps.now().getTime() - date.getTime()) / 1000));
    const age = seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h`;
    return `Atualizado há ${age}.`;
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
