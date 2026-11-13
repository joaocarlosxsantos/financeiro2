import { createHash } from "node:crypto";
import { z } from "zod";
import { pluggyAccountSchema, pluggyTransactionSchema } from "./schemas";

const BASE = "https://api.pluggy.ai";
const PAGE_LIMIT = 200;
const listSchema = z.object({ results: z.array(z.unknown()), next: z.string().nullable().optional(), totalPages: z.number().int().positive().optional(), page: z.number().int().positive().optional() });

export class PluggyHttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly providerMessage: string, readonly endpoint: string) {
    super(`PLUGGY_HTTP_${status}_${code}`);
    this.name = "PluggyHttpError";
  }
}

function safeEndpoint(path: string): string {
  const pathname = new URL(path, BASE).pathname;
  if (/^\/items\/[^/]+$/.test(pathname)) return "/items/:id";
  if (pathname === "/investments") return pathname;
  if (/^\/investments\/[^/]+\/transactions$/.test(pathname)) return "/investments/:id/transactions";
  if (pathname === "/auth" || pathname === "/connect_token" || pathname === "/accounts" || pathname === "/bills" || pathname === "/v2/transactions") return pathname;
  return "/unknown";
}

function safeProviderError(body: unknown, status: number, path: string, apiKey?: string, requestBody?: unknown): { code: string; message: string } {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const nested = record.error && typeof record.error === "object" && !Array.isArray(record.error) ? record.error as Record<string, unknown> : {};
  const rawCode = [record.code, record.errorCode, record.error_code, nested.code].find((value): value is string => typeof value === "string");
  const rawMessage = [record.message, record.errorMessage, record.error_description, nested.message, record.error].find((value): value is string => typeof value === "string") ?? "Pluggy request failed.";
  const url = new URL(path, BASE);
  const privateValues = [apiKey, ...[...url.searchParams.entries()].filter(([key]) => /item.?id|account.?id/i.test(key)).map(([, value]) => value)];
  if (/^\/items\/[^/]+$/.test(url.pathname)) privateValues.push(decodeURIComponent(url.pathname.slice("/items/".length)));
  const investmentPath = url.pathname.match(/^\/investments\/([^/]+)\/transactions$/);
  if (investmentPath) privateValues.push(decodeURIComponent(investmentPath[1]!));
  for (const source of [record, requestBody && typeof requestBody === "object" ? requestBody as Record<string, unknown> : {}]) {
    for (const [key, value] of Object.entries(source)) if (/client.?id|client.?secret|api.?key|access.?token/i.test(key) && typeof value === "string") privateValues.push(value);
  }
  let code = rawCode?.trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || `HTTP_${status}`;
  let message = rawMessage.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  for (const value of privateValues) if (value) { message = message.split(value).join("[redacted]"); code = code.split(value).join("[redacted]"); }
  message = message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(item|account)\s+(?:id\s*)?[:#]?\s*[A-Za-z0-9_-]{4,}/gi, "$1 [redacted]").slice(0, 200);
  return { code, message };
}

async function request(path: string, apiKey?: string, body?: unknown, signal?: AbortSignal, method?: "PATCH"): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(`${BASE}${path}`, {
        method: method ?? (body ? "POST" : "GET"), redirect: "error", cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
        headers: { "content-type": "application/json", ...(apiKey ? { "X-API-KEY": apiKey } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.ok) return response.json();
      const status = response.status;
      const responseBody = await response.json().catch(() => null);
      const safe = safeProviderError(responseBody, status, path, apiKey, body);
      if (attempt === 0 && method !== "PATCH" && (status === 429 || status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      const endpoint = safeEndpoint(path);
      console.error("Pluggy HTTP error", { status, code: safe.code, endpoint, message: safe.message });
      throw new PluggyHttpError(status, safe.code, safe.message, endpoint);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (attempt === 0 && !(error instanceof Error && error.message.startsWith("PLUGGY_"))) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      throw error;
    }
  }
  throw new Error("PLUGGY_UNAVAILABLE");
}

const PLUGGY_ERROR_MESSAGES: Record<string, string> = {
  "403:LIST_ITEMS_FEATURE_NOT_ENABLED": "Esse item n\u00e3o pertence \u00e0 sua aplica\u00e7\u00e3o ou s\u00f3 existe em Demo. Confira a aplica\u00e7\u00e3o e o item selecionado.",
  "403": "A Pluggy recusou o acesso (403). Confira a aplica\u00e7\u00e3o e as permiss\u00f5es do item.",
  "404": "Item ou conta n\u00e3o encontrado na Pluggy. Confira o item e o v\u00ednculo da conta.",
  "401": "Autentica\u00e7\u00e3o Pluggy rejeitada. Confira as credenciais informadas.",
  "429": "Limite de chamadas da Pluggy atingido. Tente novamente mais tarde.",
  "5xx": "A Pluggy est\u00e1 indispon\u00edvel. Tente novamente mais tarde.",
  "default": "A Pluggy n\u00e3o aceitou a solicita\u00e7\u00e3o. Confira a conex\u00e3o e tente novamente.",
};

export function pluggyErrorForUser(error: PluggyHttpError): string {
  return PLUGGY_ERROR_MESSAGES[`${error.status}:${error.code}`] ?? PLUGGY_ERROR_MESSAGES[String(error.status)] ?? (error.status >= 500 ? PLUGGY_ERROR_MESSAGES["5xx"]! : PLUGGY_ERROR_MESSAGES.default!);
}

export async function authenticatePluggy(clientId: string, clientSecret: string, signal?: AbortSignal): Promise<string> {
  const result = z.object({ apiKey: z.string().min(1) }).parse(await request("/auth", undefined, { clientId, clientSecret }, signal));
  return result.apiKey;
}

export async function createPluggyConnectToken(apiKey: string, options: { clientUserId: string; avoidDuplicates?: boolean }): Promise<string> {
  const result = z.object({ accessToken: z.string().min(1) }).parse(
    await request("/connect_token", apiKey, {
      clientUserId: options.clientUserId,
      avoidDuplicates: options.avoidDuplicates ?? true,
    }),
  );
  return result.accessToken;
}

export async function getPluggyAccounts(apiKey: string, itemId: string, signal?: AbortSignal) {
  // GET /accounts accepts itemId and optional type only; it returns all item accounts.
  const params = new URLSearchParams({ itemId });
  const result = listSchema.parse(await request(`/accounts?${params}`, apiKey, undefined, signal));
  return z.array(pluggyAccountSchema).parse(result.results);
}

export async function getPluggyItem(apiKey: string, itemId: string, signal?: AbortSignal) {
  const item = z.object({
    id: z.string(),
    clientUserId: z.string().nullable().optional(),
    status: z.string().max(80),
    executionStatus: z.string().max(80).nullable().optional(),
  }).parse(await request(`/items/${encodeURIComponent(itemId)}`, apiKey, undefined, signal));
  const known = new Set(["UPDATED", "UPDATING", "LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT", "LOGIN_IN_PROGRESS"]);
  return {
    id: item.id,
    clientUserId: item.clientUserId ?? null,
    status: known.has(item.status) ? item.status : "UNKNOWN",
    executionStatus: item.executionStatus ?? null,
  };
}

/** PATCH /items/{id} com corpo vazio: pede atualização ao banco. Sem retry automático (cota por item). */
export async function patchPluggyItem(apiKey: string, itemId: string, signal?: AbortSignal) {
  const item = z.object({ status: z.string().max(80), executionStatus: z.string().max(80).nullable().optional() })
    .parse(await request(`/items/${encodeURIComponent(itemId)}`, apiKey, undefined, signal, "PATCH"));
  return { status: item.status, executionStatus: item.executionStatus ?? null };
}

export async function getPluggyItemStatus(apiKey: string, itemId: string, signal?: AbortSignal) {
  const item = await getPluggyItem(apiKey, itemId, signal);
  return { status: item.status, executionStatus: item.executionStatus };
}

async function collect(path: string, apiKey: string, pagination: "cursor" | "page", signal?: AbortSignal) {
  const rows: unknown[] = [];
  let nextPath: string | null = path;
  for (let page = 0; nextPath && page < PAGE_LIMIT; page++) {
    const result = listSchema.parse(await request(nextPath, apiKey, undefined, signal));
    rows.push(...result.results);
    if (rows.length > 50_000) throw new Error("PLUGGY_RESPONSE_LIMIT");
    if (pagination === "cursor") {
      const nextRaw = typeof result.next === "string" ? result.next.trim() : "";
      if (!nextRaw) { nextPath = null; continue; }
      const next = new URL(nextRaw, `${BASE}/v2/transactions`);
      if (next.origin !== BASE || next.pathname !== "/v2/transactions" || !next.searchParams.has("after")) throw new Error("PLUGGY_PAGINATION_INVALID");
      const allowed = new Set(["accountId", "after", "dateFrom", "dateTo", "createdAtFrom", "ids"]);
      if ([...next.searchParams.keys()].some((key) => !allowed.has(key))) throw new Error("PLUGGY_PAGINATION_INVALID");
      nextPath = `${next.pathname}${next.search}`;
    } else if (result.totalPages && result.page && result.page < result.totalPages) {
      const url: URL = new URL(nextPath, BASE);
      url.searchParams.set("page", String(result.page + 1));
      nextPath = `${url.pathname}${url.search}`;
    } else nextPath = null;
  }
  if (nextPath) throw new Error("PLUGGY_PAGE_LIMIT");
  return rows;
}

export async function getPluggyTransactions(apiKey: string, accountId: string, from: string, signal?: AbortSignal) {
  // GET /v2/transactions uses a cursor and defaults to 500 results; it has no pageSize parameter.
  const params = new URLSearchParams({ accountId, dateFrom: from });
  const rawRows = await collect(`/v2/transactions?${params}`, apiKey, "cursor", signal);
  const transactions: z.infer<typeof pluggyTransactionSchema>[] = [];
  let invalid = 0;
  for (const rawRow of rawRows) {
    const parsed = pluggyTransactionSchema.safeParse(rawRow);
    if (parsed.success) transactions.push(parsed.data);
    else invalid++;
  }
  return { transactions, invalid };
}

export async function getPluggyBills(apiKey: string, accountId: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ accountId, page: "1", pageSize: "500" });
  const rows = await collect(`/bills?${params}`, apiKey, "page", signal);
  return z.array(z.object({ id: z.string(), dueDate: z.string(), totalAmount: z.number().finite().nullable().optional(), totalAmountCurrencyCode: z.string(), minimumPaymentAmount: z.number().finite().nullable().optional() })).parse(rows);
}

export const investmentRemoteId = (connectionId: string) => `investments:${connectionId}`;

const investmentSchema = z.object({ id: z.string().min(1).max(200), name: z.string().max(300).nullish(), balance: z.number().finite().nullish(), currencyCode: z.string().length(3).nullish() });
const investmentTxSchema = z.object({
  id: z.string().min(1).max(200), type: z.string().max(40), amount: z.number().finite().nullish(), value: z.number().finite().nullish(),
  tradeDate: z.string().nullish(), date: z.string().nullish(), description: z.string().max(300).nullish(), movementType: z.string().nullish(),
});

/** Investimentos são por item (não por conta): soma BRL vira o saldo e BUY/SELL/TAX viram lançamentos no formato de transação Pluggy. */
export async function getPluggyInvestmentSnapshot(apiKey: string, itemId: string, remoteId: string, signal?: AbortSignal) {
  const investments = z.array(investmentSchema).parse(await collect(`/investments?${new URLSearchParams({ itemId, pageSize: "500", page: "1" })}`, apiKey, "page", signal));
  if (investments.length > 100) throw new Error("PLUGGY_RESPONSE_LIMIT");
  const brl = investments.filter((row) => (row.currencyCode ?? "BRL") === "BRL");
  const balance = brl.reduce((sum, row) => sum + (row.balance ?? 0), 0);
  const transactions: z.infer<typeof pluggyTransactionSchema>[] = [];
  let invalid = 0;
  for (const inv of brl) {
    const rows = await collect(`/investments/${encodeURIComponent(inv.id)}/transactions?${new URLSearchParams({ pageSize: "500", page: "1" })}`, apiKey, "page", signal);
    for (const raw of rows) {
      const parsed = investmentTxSchema.safeParse(raw);
      const row = parsed.success ? parsed.data : null;
      const day = row ? (row.tradeDate ?? row.date) : null;
      const amount = row ? Math.abs(row.amount ?? row.value ?? 0) : 0;
      const when = day ? new Date(day) : null;
      if (!row || !when || Number.isNaN(when.getTime()) || !amount) { invalid++; continue; }
      const label = { BUY: "Aplicação", SELL: "Resgate", TAX: "Imposto", TRANSFER: "Transferência" }[row.type] ?? row.type;
      const into = row.type === "BUY" || (row.type === "TRANSFER" && row.movementType === "CREDIT");
      const externalId = `inv-${inv.id}-${row.id}`;
      const mapped = pluggyTransactionSchema.safeParse({
        id: externalId.length <= 200 ? externalId : `inv-sha256-${createHash("sha256").update(JSON.stringify([inv.id, row.id])).digest("hex")}`, accountId: remoteId, description: `${label} · ${inv.name ?? "Investimento"}`.slice(0, 500),
        date: when.toISOString(), amount, currencyCode: "BRL", type: into ? "CREDIT" : "DEBIT", status: "POSTED",
        // BUY/SELL são movimentação entre contas, não receita/despesa.
        operationType: row.type === "BUY" || row.type === "SELL" ? "INVESTMENT_TRANSFER" : null,
      });
      if (mapped.success) transactions.push(mapped.data); else invalid++;
    }
  }
  return { balance, transactions: { transactions, invalid } };
}
