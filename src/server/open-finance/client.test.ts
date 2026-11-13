import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticatePluggy, getPluggyAccounts, getPluggyBills, getPluggyInvestmentSnapshot, investmentRemoteId, getPluggyItemStatus, getPluggyTransactions, PluggyHttpError, pluggyErrorForUser, requestPluggyItemUpdate } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("Pluggy client", () => {
  it("sums BRL investments and maps BUY/SELL to transfers with opposite directions", async () => {
    const reply = (results: unknown[]) => new Response(JSON.stringify({ results, page: 1, totalPages: 1 }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply([
        { id: "brl-1", balance: 100.25, currencyCode: "BRL" },
        { id: "brl-2", balance: 200.5, currencyCode: "BRL" },
        { id: "usd", balance: 999, currencyCode: "USD" },
      ]))
      .mockResolvedValueOnce(reply([
        { id: "buy", type: "BUY", amount: 100, tradeDate: "2026-10-01" },
        { id: "sell", type: "SELL", value: 50, date: "2026-10-02" },
        { id: "tax", type: "TAX", amount: 2, date: "2026-10-02" },
        { id: "bad", type: "BUY", amount: 10, date: "invalid" },
      ]))
      .mockResolvedValueOnce(reply([]));
    vi.stubGlobal("fetch", fetchMock);
    const remoteId = investmentRemoteId("connection");
    const snapshot = await getPluggyInvestmentSnapshot("key", "item", remoteId);
    expect(snapshot.balance).toBe(300.75);
    expect(snapshot.transactions.invalid).toBe(1);
    expect(snapshot.transactions.transactions).toMatchObject([
      { accountId: remoteId, type: "CREDIT", amount: 100, operationType: "INVESTMENT_TRANSFER" },
      { accountId: remoteId, type: "DEBIT", amount: 50, operationType: "INVESTMENT_TRANSFER" },
      { accountId: remoteId, type: "DEBIT", amount: 2, operationType: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects oversized investment snapshots instead of publishing a partial balance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: Array.from({ length: 101 }, (_, i) => ({ id: String(i), balance: 1, currencyCode: "BRL" })) }))));
    await expect(getPluggyInvestmentSnapshot("key", "item", "remote")).rejects.toThrow("PLUGGY_RESPONSE_LIMIT");
  });

  it("redacts investment IDs in provider errors and keeps endpoint logs generic", async () => {
    const privateId = "private-investment-id";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: privateId, balance: 1, currencyCode: "BRL" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "NOT_FOUND", message: `Missing investment ${privateId}` }), { status: 404 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(getPluggyInvestmentSnapshot("key", "item", "remote")).rejects.toMatchObject({ endpoint: "/investments/:id/transactions", providerMessage: "Missing investment [redacted]" });
      expect(log).toHaveBeenCalledWith("Pluggy HTTP error", { status: 404, code: "NOT_FOUND", endpoint: "/investments/:id/transactions" });
    } finally { log.mockRestore(); }
  });

  it("keeps long investment transaction IDs distinct and stable", async () => {
    const run = async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: "i".repeat(200), balance: 1, currencyCode: "BRL" }] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ results: ["a", "b"].map((id) => ({ id, type: "BUY", amount: 1, date: "2026-10-01" })) }))));
      return (await getPluggyInvestmentSnapshot("key", "item", "remote")).transactions.transactions.map((row) => row.id);
    };
    const ids = await run();
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.length <= 200)).toBe(true);
    expect(await run()).toEqual(ids);
  });
  it("cancelamento do sync chega ao fetch e não dispara retry nem outras páginas", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      controller.abort();
      expect(options.signal?.aborted).toBe(true);
      options.signal?.throwIfAborted();
      return new Response();
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(getPluggyTransactions("temporary-key", "account", "2026-11-01", controller.signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("uses only fixed user messages for provider failures", () => {
    const genericForbidden = pluggyErrorForUser(new PluggyHttpError(403, "OTHER_CODE", "private provider response", "/items/:id"));
    const unknownClientError = pluggyErrorForUser(new PluggyHttpError(422, "UNPROCESSABLE", "private provider response", "/accounts"));
    expect(genericForbidden).toContain("recusou o acesso");
    expect(unknownClientError).toContain("aceitou a");
    expect(genericForbidden).not.toContain("private provider response");
    expect(unknownClientError).not.toContain("private provider response");
  });

  it("uses the fixed host and follows bounded cursor pagination for v2 transactions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: "tx-1", accountId: "account", description: "Compra", date: "2026-01-02T00:00:00.000Z", amount: 10, currencyCode: "BRL", type: "DEBIT", status: "PENDING" }], next: "?accountId=account&after=cursor" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [], next: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPluggyTransactions("temporary-key", "account", "2026-01-01");
    expect(result.transactions).toHaveLength(1);
    expect(result.invalid).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstOptions] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [secondUrl, secondOptions] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(firstUrl).toMatch(/^https:\/\/api\.pluggy\.ai\/v2\/transactions\?/);
    expect(new URL(firstUrl).searchParams.get("dateFrom")).toBe("2026-01-01");
    expect(new URL(firstUrl).searchParams.has("pageSize")).toBe(false);
    expect(new URL(firstUrl).searchParams.has("dateTo")).toBe(false);
    expect(secondUrl).toMatch(/^https:\/\/api\.pluggy\.ai\/v2\/transactions\?/);
    expect(firstOptions.headers).toMatchObject({ "X-API-KEY": "temporary-key" });
    expect(secondOptions.redirect).toBe("error");
  });

  it("sends only documented query parameters and discovers both bank and credit accounts", async () => {
    const calls: URL[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url);
      const accepted = url.pathname === "/accounts" ? new Set(["itemId", "type"])
        : url.pathname === "/bills" ? new Set(["accountId", "page", "pageSize"])
          : url.pathname === "/v2/transactions" ? new Set(["accountId", "dateFrom", "dateTo", "after"])
            : /^\/items\/[^/]+$/.test(url.pathname) ? new Set<string>() : new Set<string>();
      const unknown = [...url.searchParams.keys()].find((key) => !accepted.has(key));
      if (unknown) return new Response(JSON.stringify({ message: `property ${unknown} should not exist` }), { status: 400 });
      if (url.pathname === "/accounts") return new Response(JSON.stringify({ results: [
        { id: "bank-1", itemId: "item-1", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Checking", currencyCode: "BRL" },
        { id: "credit-1", itemId: "item-1", type: "CREDIT", subtype: "CREDIT_CARD", name: "Card", currencyCode: "BRL", creditData: { creditLimit: 1000, availableCreditLimit: 800 } },
      ] }), { status: 200 });
      if (url.pathname === "/bills") return new Response(JSON.stringify({ results: [], totalPages: 1, page: 1 }), { status: 200 });
      if (url.pathname === "/v2/transactions") return new Response(JSON.stringify({ results: [], next: null }), { status: 200 });
      return new Response(JSON.stringify({ id: "item-1", status: "UPDATED", executionStatus: "SUCCESS" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const accounts = await getPluggyAccounts("api-key", "item-1");
    expect(accounts.map((account) => account.type)).toEqual(["BANK", "CREDIT"]);
    await getPluggyBills("api-key", "credit-1");
    await getPluggyTransactions("api-key", "bank-1", "2026-09-01");
    await getPluggyItemStatus("api-key", "item-1");
    expect(calls.find((url) => url.pathname === "/accounts")?.searchParams.has("pageSize")).toBe(false);
    expect(calls.find((url) => url.pathname === "/bills")?.searchParams.get("pageSize")).toBe("500");
    expect(calls.find((url) => url.pathname === "/v2/transactions")?.searchParams.get("dateFrom")).toBe("2026-09-01");
    expect(calls.find((url) => url.pathname === "/v2/transactions")?.searchParams.has("pageSize")).toBe(false);
    expect(calls.find((url) => url.pathname === "/items/item-1")?.search).toBe("");
  });

  it("paginates three v2 transaction pages using only the documented after cursor, never page/pageSize", async () => {
    const calls: URL[] = [];
    const tx = (id: string, date: string) => ({ id, accountId: "account", description: "row", date, amount: 10, currencyCode: "BRL", type: "DEBIT", status: "POSTED" });
    const responses = [
      { results: [tx("tx-1", "2026-01-02T00:00:00.000Z")], next: "?accountId=account&after=cursor-2" },
      { results: [tx("tx-2", "2026-01-03T00:00:00.000Z")], next: "?accountId=account&after=cursor-3" },
      { results: [tx("tx-3", "2026-01-04T00:00:00.000Z")], next: null, totalPages: 99, page: 1 },
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url);
      const unknown = [...url.searchParams.keys()].find((key) => !["accountId", "dateFrom", "dateTo", "after"].includes(key));
      if (unknown) return new Response(JSON.stringify({ message: `property ${unknown} should not exist` }), { status: 400 });
      return new Response(JSON.stringify(responses[calls.length - 1]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPluggyTransactions("test-key", "account", "2026-01-01");
    expect(result.transactions).toHaveLength(3);
    expect(result.invalid).toBe(0);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.searchParams.get("dateFrom")).toBe("2026-01-01");
    expect(calls[0]?.searchParams.has("page")).toBe(false);
    expect(calls[0]?.searchParams.has("pageSize")).toBe(false);
    expect(calls.slice(1).map((url) => url.searchParams.get("after"))).toEqual(["cursor-2", "cursor-3"]);
    expect(calls.every((url) => !url.searchParams.has("page") && !url.searchParams.has("pageSize"))).toBe(true);
  });

  it("rejects cursor pagination when next points to foreign origin or invalid path", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      results: [{ id: "tx-1", accountId: "account", description: "P1", date: "2026-01-02T00:00:00.000Z", amount: 10, currencyCode: "BRL", type: "DEBIT", status: "POSTED" }],
      next: "https://evil.example.com/v2/transactions?accountId=account&after=bad",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getPluggyTransactions("test-key", "account", "2026-01-01")).rejects.toThrow("PLUGGY_PAGINATION_INVALID");
  });

  it("counts malformed transaction rows without discarding valid rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { id: "tx-valid", accountId: "account", description: "redacted", date: "2026-01-02T00:00:00.000Z", amount: 10, currencyCode: "BRL", type: "DEBIT", status: "POSTED" },
      { id: "tx-invalid", accountId: "account", description: "bad", date: "not-a-date", amount: "not-a-number", currencyCode: "BRL", type: "DEBIT", status: "POSTED" },
    ], next: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPluggyTransactions("test-key", "account", "2026-01-01");
    expect(result.transactions).toHaveLength(1);
    expect(result.invalid).toBe(1);
  });

  it("reads only sanitized item status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "item-id", status: "UPDATED", executionStatus: "SUCCESS", error: { message: "sensitive" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPluggyItemStatus("temporary-key", "item-id")).toEqual({ status: "UPDATED", executionStatus: "SUCCESS" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.pluggy.ai/items/item-id");
  });

  it("pede atualização do item com PATCH e corpo vazio (credenciais ficam no cofre da Pluggy)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "item-id", status: "UPDATING", executionStatus: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestPluggyItemUpdate("api-key", "item-id")).toEqual({ accepted: true, status: "UPDATING", executionStatus: null });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.pluggy.ai/items/item-id");
    expect(options.method).toBe("PATCH");
    expect(options.body).toBe("{}");
    expect(options.headers).toMatchObject({ "X-API-KEY": "api-key" });
  });

  it("preserves sanitized 403 code/message without credentials or IDs and maps it for the UI", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "LIST_ITEMS_FEATURE_NOT_ENABLED", message: "client-123 secret-client cannot access item secret-item" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let caught: unknown;
    try { await authenticatePluggy("client-123", "secret-client"); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(PluggyHttpError);
    expect(caught).toMatchObject({ status: 403, code: "LIST_ITEMS_FEATURE_NOT_ENABLED", endpoint: "/auth" });
    expect((caught as PluggyHttpError).providerMessage).not.toContain("client-123");
    expect((caught as PluggyHttpError).providerMessage).not.toContain("secret-client");
    expect((caught as PluggyHttpError).providerMessage).not.toContain("secret-item");
    expect(pluggyErrorForUser(caught as PluggyHttpError)).toContain("só existe em Demo");
    expect(log).toHaveBeenCalledWith("Pluggy HTTP error", { status: 403, code: "LIST_ITEMS_FEATURE_NOT_ENABLED", endpoint: "/auth" });
    log.mockRestore();
  });

  it("maps 404 to a clear item/account message and redacts the item ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "ITEM_NOT_FOUND", message: "No item private-item-id" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let caught: unknown;
    try { await getPluggyItemStatus("temporary-key", "private-item-id"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ status: 404, code: "ITEM_NOT_FOUND", endpoint: "/items/:id" });
    expect((caught as PluggyHttpError).providerMessage).not.toContain("private-item-id");
    expect(pluggyErrorForUser(caught as PluggyHttpError)).toContain("não encontrado");
    expect(log).toHaveBeenCalledWith("Pluggy HTTP error", { status: 404, code: "ITEM_NOT_FOUND", endpoint: "/items/:id" });
    log.mockRestore();
  });

  it("retries 5xx once and keeps the final HTTP status and short message", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "UPSTREAM_DOWN", message: "x".repeat(300) }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "UPSTREAM_DOWN", message: "x".repeat(300) }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let caught: unknown;
    try { await getPluggyTransactions("temporary-key", "account-id", "2026-01-01"); } catch (error) { caught = error; }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(caught).toMatchObject({ status: 503, code: "UPSTREAM_DOWN", endpoint: "/v2/transactions" });
    expect((caught as PluggyHttpError).providerMessage).toHaveLength(200);
    expect(pluggyErrorForUser(caught as PluggyHttpError)).toContain("Tente novamente mais tarde");
    expect(log).toHaveBeenCalledWith("Pluggy HTTP error", { status: 503, code: "UPSTREAM_DOWN", endpoint: "/v2/transactions" });
    log.mockRestore();
  });
});
