import {
  addMonths,
  endOfMonth,
  format,
  parse,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export type MonthRef = { year: number; month: number }; // month: 1-12

export function currentMonthRef(): MonthRef {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function monthRefFromParam(param?: string | null): MonthRef {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  return currentMonthRef();
}

export function monthRefToParam({ year, month }: MonthRef): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthRange({ year, month }: MonthRef) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const d = addMonths(new Date(ref.year, ref.month - 1, 1), delta);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthLabel({ year, month }: MonthRef): string {
  return format(new Date(year, month - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
}

export function monthShortLabel({ year, month }: MonthRef): string {
  return format(new Date(year, month - 1, 1), "MMM/yy", { locale: ptBR });
}

export function lastNMonths(n: number, from = currentMonthRef()): MonthRef[] {
  const base = new Date(from.year, from.month - 1, 1);
  return Array.from({ length: n }, (_, i) => {
    const d = subMonths(base, n - 1 - i);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

const MONTHS_PT_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Toda data do sistema que representa um DIA (lançamento, meta, período de
 * importação...) é uma string "AAAA-MM-DD" ou um `Date` âncorado em UTC (meio-dia
 * UTC na maioria dos casos) — nunca "a hora agora". Formatar lendo os campos
 * *locais* do `Date` (o que `date-fns`'s `format()` faz, e o que `new Date(string)`
 * incentiva a fazer por engano) quebra isso: uma string "2026-09-30" vira meia-noite
 * UTC, e num fuso atrás de UTC (o do Brasil, por exemplo) isso já é 29/09 no
 * relógio local — a data volta um dia inteiro. Por isso as duas funções abaixo
 * SEMPRE leem em UTC, nunca no fuso de quem está com o navegador aberto.
 */
function toUtcDateObject(date: Date | string): Date {
  return typeof date === "string" ? new Date(date) : date;
}

export function formatDate(date: Date | string): string {
  const d = toUtcDateObject(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function formatDayMonth(date: Date | string): string {
  const d = toUtcDateObject(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS_PT_SHORT[d.getUTCMonth()]}`;
}

/** Meio-dia UTC do mesmo dia civil (ano/mês/dia) de um `Date` local. */
function toUtcNoon(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
}

/**
 * Aceita dd/MM/yyyy, yyyy-MM-dd, dd/MM/yy e YYYYMMDD (OFX).
 *
 * `date-fns`'s `parse` devolve meia-noite no fuso LOCAL de quem está rodando
 * o código — inofensivo no Brasil (meia-noite local vira manhã em UTC, mesmo
 * dia), mas vira o dia anterior em UTC para qualquer fuso ADIANTE de UTC
 * (ex.: Ásia, Oceania) assim que alguém chama `.toISOString()` nesse valor,
 * como o resto do sistema faz. Por isso reancoramos aqui mesmo, ao meio-dia
 * UTC do dia que foi lido — never deixamos meia-noite local escapar desta
 * função.
 */
export function parseFlexibleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const patterns = ["dd/MM/yyyy", "yyyy-MM-dd", "dd/MM/yy", "dd-MM-yyyy", "yyyyMMdd"];
  for (const p of patterns) {
    const d = parse(s.slice(0, p.length), p, new Date());
    if (!Number.isNaN(d.getTime())) return toUtcNoon(d);
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : toUtcNoon(fallback);
}

export { startOfMonth, endOfMonth };
