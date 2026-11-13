/** Orçamento de refresh Open Finance (Pluggy PATCH /items/{id}). Função pura: sem I/O, sem relógio próprio. */
export const REFRESH_DAILY_MAX = 8;
export const REFRESH_MONTHLY_MAX = 230;
export const REFRESH_MIN_INTERVAL_MS = 90 * 60_000;

export type RefreshReason = "morning" | "scheduled";
export type RefreshDenial = "MONTHLY_CAP" | "DAILY_CAP" | "TOO_SOON" | "MORNING_DONE" | "RATE_LIMITED";
export type RefreshRecord = { at: Date; reason: RefreshReason; retryAfterAt?: Date | null };

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
/** Dia civil de São Paulo (YYYY-MM-DD). */
export const saoPauloDay = (date: Date) => dayFormat.format(date);
/** Mês civil de São Paulo (YYYY-MM). */
export const saoPauloMonth = (date: Date) => dayFormat.format(date).slice(0, 7);
/** Primeiro instante do mês civil de São Paulo (-03:00 fixo, sem horário de verão desde 2019). */
export const saoPauloMonthStart = (date: Date) => new Date(`${saoPauloMonth(date)}-01T00:00:00-03:00`);

/**
 * `item`: refreshes desta conexão no mês. `all`: refreshes de todas as conexões
 * do usuário no mês (cota mensal é por CPF/instituição, então conta tudo).
 */
export function decideRefresh(input: { now: Date; reason: RefreshReason; item: RefreshRecord[]; all: RefreshRecord[] }): { allowed: true } | { allowed: false; denial: RefreshDenial } {
  const { now, reason } = input;
  const day = saoPauloDay(now);
  const month = saoPauloMonth(now);
  // Retry-After da Pluggy vale para o app inteiro até o prazo (qualquer conexão, qualquer motivo).
  if (input.all.some((row) => row.retryAfterAt && row.retryAfterAt.getTime() > now.getTime())) return { allowed: false, denial: "RATE_LIMITED" };
  if (input.all.filter((row) => saoPauloMonth(row.at) === month).length >= REFRESH_MONTHLY_MAX) return { allowed: false, denial: "MONTHLY_CAP" };

  const today = input.item.filter((row) => saoPauloDay(row.at) === day);
  const morningDone = today.some((row) => row.reason === "morning");
  if (reason === "morning") {
    if (morningDone) return { allowed: false, denial: "MORNING_DONE" };
    return today.length < REFRESH_DAILY_MAX ? { allowed: true } : { allowed: false, denial: "DAILY_CAP" };
  }

  // Agendado: uma vaga do dia fica reservada ao matinal enquanto ele não rodou.
  const reserved = morningDone ? 0 : 1;
  if (today.length + reserved >= REFRESH_DAILY_MAX) return { allowed: false, denial: "DAILY_CAP" };
  const last = input.item.reduce<number | null>((latest, row) => (latest === null || row.at.getTime() > latest ? row.at.getTime() : latest), null);
  if (last !== null && now.getTime() - last < REFRESH_MIN_INTERVAL_MS) return { allowed: false, denial: "TOO_SOON" };
  return { allowed: true };
}

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" });
/** Hora 06 a 08 de São Paulo = refresh matinal (06:30); demais horários agendados (09:00 a 23:00). */
export function refreshReasonFor(now: Date): RefreshReason {
  const hour = Number(hourFormat.format(now));
  return hour >= 6 && hour <= 8 ? "morning" : "scheduled";
}
