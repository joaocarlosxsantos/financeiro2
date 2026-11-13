import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { defaultRefreshDependencies, requestOpenFinanceRefresh, type RefreshDependencies } from "./refresh";

const TELEGRAM_MAX = 4096;
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

type Schedule = (task: () => Promise<void>) => void;

/**
 * Dentro de Route Handler/Server Function/Server Component, after() roda depois da resposta.
 * Import dinâmico: só carrega next/server quando a flag está ligada (testes do Telegram não o importam).
 */
const runAfterResponse: Schedule = (task) => {
  void import("next/server")
    .then(({ after }) => after(task))
    .catch(() => task());
};

/**
 * Consulta/tela pediu dados: dispara refresh em background se a flag estiver ligada.
 * Nunca bloqueia: quem chama responde com o cache. O orçamento decide dentro da tarefa.
 */
export function scheduleOpenFinanceRefresh(
  userId: string,
  deps: RefreshDependencies = defaultRefreshDependencies,
  schedule: Schedule = runAfterResponse,
): boolean {
  if (!deps.enabled()) return false;
  schedule(async () => {
    try {
      for (const row of await deps.connections(userId)) {
        await requestOpenFinanceRefresh({ userId, connectionId: row.connectionId, reason: "on_demand" }, deps);
      }
    } catch (error) {
      console.error("[open-finance-refresh]", { status: "on_demand_failed", code: error instanceof Error ? error.name : "UNKNOWN" });
    }
  });
  return true;
}

/** Idade do dado salvo (snapshot do banco), nunca o horário da última tentativa. */
export function openFinanceAgeLine(date: Date | null, now: Date): string {
  if (!date) return "Dados do banco sem horário de atualização disponível.";
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  const age = seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h`;
  return `Dados do banco de ${timeFormat.format(date)} (${dayMonthFormat.format(date)}), há ${age}.`;
}

/** Menor data de snapshot entre contas de integração; null se o usuário não tem integração. */
export async function openFinanceDataDate(userId: string): Promise<{ present: boolean; date: Date | null }> {
  const rows = await db.select({ bankBalanceAt: accounts.bankBalanceAt, creditSnapshotAt: accounts.creditSnapshotAt })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.financeMode, "integracao"), eq(accounts.archived, false)));
  if (!rows.length) return { present: false, date: null };
  const dates = rows.map((row) => row.bankBalanceAt ?? row.creditSnapshotAt);
  if (dates.some((date) => !date)) return { present: true, date: null };
  return { present: true, date: new Date(Math.min(...dates.map((date) => date!.getTime()))) };
}

/**
 * Resposta do Telegram com cache: agenda refresh, gera o texto atual e anexa a idade do dado.
 * Com a flag desligada, o texto sai exatamente como antes.
 */
export async function telegramReplyWithOpenFinanceAge(
  userId: string,
  build: () => Promise<string | null>,
  deps: RefreshDependencies = defaultRefreshDependencies,
  now = new Date(),
): Promise<string | null> {
  scheduleOpenFinanceRefresh(userId, deps);
  const text = await build();
  if (!text || !deps.enabled()) return text;
  const data = await openFinanceDataDate(userId).catch(() => null);
  if (!data?.present) return text;
  const notice = openFinanceAgeLine(data.date, now);
  return `${text.slice(0, TELEGRAM_MAX - notice.length - 2)}\n\n${notice}`;
}
