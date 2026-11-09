/**
 * Conservatively excludes only transactions clearly before the owner's cutoff.
 * Pluggy dates may be date-only or timestamps; retain a transaction if its raw,
 * UTC, or São Paulo calendar date falls on/after the cutoff.
 */
export function isBeforeCutoff(rowDate: string, cutoff: string): boolean {
  const d = new Date(rowDate);
  if (Number.isNaN(d.getTime())) {
    return /^\d{4}-\d{2}-\d{2}/.test(rowDate) ? rowDate.slice(0, 10) < cutoff : true;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(rowDate) && rowDate.slice(0, 10) >= cutoff) return false;
  if (d.toISOString().slice(0, 10) >= cutoff) return false;
  try {
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    if (localDate >= cutoff) return false;
  } catch { /* fallback */ }
  return true;
}

/** Convert a provider instant to the owner's Sao Paulo civil date, anchored at noon UTC. */
export function anchorPluggyCivilDate(rowDate: string): Date {
  const parsed = new Date(rowDate);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid Pluggy date");
  const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(rowDate)
    ? rowDate
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(parsed);
  return new Date(`${civilDate}T12:00:00.000Z`);
}
