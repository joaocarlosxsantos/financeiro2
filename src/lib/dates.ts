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

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd/MM/yyyy");
}

export function formatDayMonth(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd MMM", { locale: ptBR });
}

/** Aceita dd/MM/yyyy, yyyy-MM-dd, dd/MM/yy e YYYYMMDD (OFX). */
export function parseFlexibleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const patterns = ["dd/MM/yyyy", "yyyy-MM-dd", "dd/MM/yy", "dd-MM-yyyy", "yyyyMMdd"];
  for (const p of patterns) {
    const d = parse(s.slice(0, p.length), p, new Date());
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export { startOfMonth, endOfMonth };
