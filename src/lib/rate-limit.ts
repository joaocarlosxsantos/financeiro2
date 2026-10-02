/**
 * Rate limit simples em memória.
 * ponytail: em memória, não compartilhado entre instâncias serverless;
 * trocar por Upstash/Redis se precisar.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
const PURGE_ABOVE = 1000;

function purge(now: number) {
  if (store.size <= PURGE_ABOVE) return;
  for (const [k, e] of store) if (now >= e.resetAt) store.delete(k);
}

function live(key: string, now: number): Entry | undefined {
  const e = store.get(key);
  return e && now < e.resetAt ? e : undefined;
}

function result(e: Entry | undefined, max: number, now: number) {
  if (e && e.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((e.resetAt - now) / 1000) };
  }
  return { allowed: true } as { allowed: boolean; retryAfterSeconds?: number };
}

/** Conta cada chamada como uma tentativa (ex.: cadastro). */
export function checkRateLimit(key: string, max = MAX_ATTEMPTS, now = Date.now()) {
  purge(now);
  const e = live(key, now);
  if (!e) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true } as { allowed: boolean; retryAfterSeconds?: number };
  }
  const r = result(e, max, now);
  if (r.allowed) e.count++;
  return r;
}

/** Só consulta, sem contar (ex.: login: só as falhas contam). */
export function isRateLimited(key: string, max = MAX_ATTEMPTS, now = Date.now()) {
  return result(live(key, now), max, now);
}

export function recordFailure(key: string, now = Date.now()) {
  purge(now);
  const e = live(key, now);
  if (e) e.count++;
  else store.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

export function clearFailures(key: string) {
  store.delete(key);
}
