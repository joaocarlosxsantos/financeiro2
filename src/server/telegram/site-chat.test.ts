import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const balance = vi.hoisted(() => vi.fn().mockResolvedValue({ availableCents: 1000, investedCents: 0, netWorthCents: 1000, totalIncomplete: false, needsOpeningBalance: false }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("./command-service", () => ({ ownerCommandDependencies: () => ({ balance }) }));
import { claimSiteChatRequest, siteCommandReply } from "./site-chat";
import { HELP } from "./commands";

describe("Adaptador do chat do site", () => {
  it("executa o mesmo router do bot, com dono autenticado sem vínculo Telegram", async () => {
    expect((await siteCommandReply("owner", "/saldo")).replace(/\u00a0/g, " ")).toContain("R$ 10,00");
    expect(balance).toHaveBeenCalledWith("owner");
    expect(await siteCommandReply("owner", "/ajuda")).toBe(HELP);
    await expect(siteCommandReply("owner", "/saldo injected-owner")).rejects.toThrow("invalid_site_command");
  });
  it("limite é UPSERT atômico, namespace separado, relógio do banco e contador saturado", async () => {
    let inserted: unknown; let conflict: { set: Record<string, SQL> } | undefined;
    const fake = { insert: () => ({ values: (v: unknown) => { inserted = v; return {
      onConflictDoUpdate: (v: { set: Record<string, SQL> }) => { conflict = v; return { returning: async () => [{ count: 21, retryAfter: 40 }] }; },
    }; } }) };
    expect(await claimSiteChatRequest("owner", fake as never)).toEqual({ allowed: false, retryAfterSeconds: 40 });
    expect(inserted).toMatchObject({ chatId: "site:owner", lastUpdateId: 0, requestCount: 1 });
    const query = new PgDialect().sqlToQuery(conflict!.set.requestCount);
    expect(query.sql).toContain("clock_timestamp()"); expect(query.sql).toContain("least("); expect(query.params).toContain(21);
  });
});
