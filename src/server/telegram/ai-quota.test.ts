import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), values: vi.fn(), rows: [] as unknown[] }));
vi.mock("@/db", () => ({ db: { insert: () => ({ values: (value: unknown) => {
  mocks.values(value);
  return { onConflictDoUpdate: (config: unknown) => { mocks.upsert(config); return { returning: async () => mocks.rows }; } };
} }) } }));
import { consumeAiQuota } from "./ai-quota";
import { telegramAiUsage } from "@/db/schema";
beforeEach(() => { vi.clearAllMocks(); mocks.rows = [{ chatId: "123" }]; });

describe("quota IA persistente", () => {
  it("usa dia São Paulo e reserva de forma atômica com os dois limites no WHERE", async () => {
    expect(await consumeAiQuota("123", new Date("2026-11-11T01:00Z"))).toBe(true);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ chatId: "123", day: "2026-11-10", dayCount: 1, minuteCount: 1 }));
    const config = mocks.upsert.mock.calls[0][0];
    expect(config.target).toBe(telegramAiUsage.chatId);
    const predicate = new PgDialect().sqlToQuery(config.setWhere as SQL);
    expect(predicate.sql).toContain(" and ");
    expect(predicate.params).toContain(20); expect(predicate.params).toContain(2);
    expect(new PgDialect().sqlToQuery(config.set.dayCount).sql).toContain("case when");
    expect(new PgDialect().sqlToQuery(config.set.minuteCount).sql).toContain("case when");
    const minuteStartedAtQuery = new PgDialect().sqlToQuery(config.set.minuteStartedAt as SQL);
    expect(predicate.params.some((p) => p instanceof Date)).toBe(false);
    expect(minuteStartedAtQuery.params.some((p) => p instanceof Date)).toBe(false);
  });
  it("quota negada não retorna reserva nem permite chamada", async () => {
    mocks.rows = [];
    expect(await consumeAiQuota("123")).toBe(false);
  });
});
