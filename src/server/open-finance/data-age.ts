import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

const TELEGRAM_MAX = 4096;
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Idade do dado salvo (snapshot do banco), nunca o horário da última tentativa. */
export function openFinanceAgeLine(date: Date | null, now: Date): string {
  if (!date) return "Dados do banco sem horário de atualização disponível.";
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  const age = seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h`;
  return `Dados do banco de ${timeFormat.format(date)} (${dayMonthFormat.format(date)}), há ${age}.`;
}

/** Menor data de snapshot entre contas de integração; present=false se o usuário não tem integração. */
export async function openFinanceDataDate(userId: string): Promise<{ present: boolean; date: Date | null }> {
  const rows = await db.select({ bankBalanceAt: accounts.bankBalanceAt, creditSnapshotAt: accounts.creditSnapshotAt })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.financeMode, "integracao"), eq(accounts.archived, false)));
  if (!rows.length) return { present: false, date: null };
  const dates = rows.map((row) => row.bankBalanceAt ?? row.creditSnapshotAt);
  if (dates.some((date) => !date)) return { present: true, date: null };
  return { present: true, date: new Date(Math.min(...dates.map((date) => date!.getTime()))) };
}

/** Anexa a idade do dado ao texto (Telegram e resumo). Sem integração, o texto sai intacto. */
export async function withOpenFinanceAge(userId: string, build: () => Promise<string | null>, now = new Date()): Promise<string | null> {
  const text = await build();
  if (!text) return text;
  const data = await openFinanceDataDate(userId).catch(() => null);
  if (!data?.present) return text;
  const notice = openFinanceAgeLine(data.date, now);
  return `${text.slice(0, TELEGRAM_MAX - notice.length - 2)}\n\n${notice}`;
}
