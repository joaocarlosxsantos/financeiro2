import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("@/db", () => ({ db: {} }));
import { reserveExternalDelivery } from "./delivery";
import { deliverySlots, groupNotificationEvents, type NotificationReceipt } from "./cadence";
import { DEFAULT_NOTIFICATION_PREFERENCES as defaults, eventSchema, pushPayload } from "./policy";
import { NotificationDispatcher } from "./dispatcher";

const receipt = (id: string, critical = false, patch = {}): NotificationReceipt => ({ id, event: eventSchema.parse({
  userId: "owner", category: "dueBills", type: "BILL", body: `Conta ${id} vence hoje`, actionUrl: "/contas-a-pagar", dedupeKey: id, critical, ...patch,
}) });

/** Transactional test adapter. Production uses PostgreSQL row/advisory locks and unique slots. */
function database(receipts: NotificationReceipt[]) {
  const rows = new Map(receipts.map(r => [r.id, { id: r.id, userId: r.event.userId, pushClaimedAt: null, telegramClaimedAt: null }]));
  const slots = new Set<string>();
  const locks: string[] = [];
  let tail = Promise.resolve();
  const dialect = new PgDialect();
  const match = (predicate: SQL) => {
    const query = dialect.sqlToQuery(predicate), field = query.sql.includes('"push_claimed_at"') ? "pushClaimedAt" : "telegramClaimedAt";
    return [...rows.values()].filter(r => query.params[0] === r.userId && query.params.slice(1).includes(r.id) && r[field as "pushClaimedAt"] === null);
  };
  const tx = {
    execute: async (statement: SQL) => { const q = dialect.sqlToQuery(statement); locks.push(q.sql); },
    select: () => ({ from: () => ({ where: (p: SQL) => ({ orderBy: () => ({ for: async () => match(p) }) }) }) }),
    insert: () => ({ values: (v: { userId: string; dedupeKey: string }) => ({ onConflictDoNothing: () => ({ returning: async () => {
      const key = `${v.userId}:${v.dedupeKey}`;
      if (slots.has(key)) return []; slots.add(key); return [{ id: key }];
    } }) }) }),
    update: () => ({ set: (values: object) => ({ where: (p: SQL) => ({ returning: async () => {
      const found = match(p); found.forEach(r => Object.assign(r, values)); return found.map(r => ({ id: r.id }));
    } }) }) }),
  };
  const connection = { transaction: (fn: (transaction: unknown) => Promise<unknown>) => {
    const pending = tail.then(() => fn(tx)); tail = pending.then(() => undefined, () => undefined); return pending;
  } };
  return { connection: connection as unknown as NonNullable<Parameters<typeof reserveExternalDelivery>[3]>, slots, locks };
}

describe("Cadência persistente e agrupamento", () => {
  it("concorrência dos crons compartilha 2 slots comuns + 1 reservado, por canal/dia", async () => {
    const receipts = Array.from({ length: 20 }, (_, i) => receipt(`r${i}`));
    const d = database(receipts), now = new Date("2026-11-14T11:00Z");
    const results = await Promise.all(receipts.map(r => reserveExternalDelivery("push", [r], now, d.connection)));
    expect(results.filter(r => r.length)).toHaveLength(2);
    expect((await reserveExternalDelivery("push", [receipt("r19", true)], now, d.connection))).toHaveLength(1);
    expect((await reserveExternalDelivery("push", [receipt("r18", true)], now, d.connection))).toHaveLength(0);
    expect(d.slots.size).toBe(3); expect(d.locks.every(q => q.includes("pg_advisory_xact_lock"))).toBe(true);
    expect((await reserveExternalDelivery("telegram", [receipts[0]], now, d.connection))).toHaveLength(1);
    expect(deliverySlots(false)).toEqual([0, 1]); expect(deliverySlots(true)).toEqual([2, 0, 1]);
  });
  it("replay não consome cota nem repete fatos; virada diária é de São Paulo", async () => {
    const receipts = [receipt("a"), receipt("b"), receipt("c")], d = database(receipts);
    const late = new Date("2026-11-15T02:59Z");
    await reserveExternalDelivery("push", [receipts[0]], late, d.connection);
    await reserveExternalDelivery("push", [receipts[0]], late, d.connection);
    expect(d.slots.size).toBe(1); expect([...d.slots][0]).toContain("2026-11-14");
    await reserveExternalDelivery("push", [receipts[1]], new Date("2026-11-15T03:00Z"), d.connection);
    expect([...d.slots][1]).toContain("2026-11-15");
  });
  it("agrupa destinos mistos na caixa e mantém assunto único na tela correta", () => {
    const bill = receipt("a").event, budget = receipt("b", false, { category: "budget", actionUrl: "/orcamento", body: "Orçamento" }).event;
    expect(groupNotificationEvents([bill, budget]).actionUrl).toBe("/notificacoes");
    expect(groupNotificationEvents([bill, { ...bill, dedupeKey: "b" }]).actionUrl).toBe("/contas-a-pagar");
    expect(groupNotificationEvents([bill, budget]).dedupeKey).toBe(groupNotificationEvents([{ ...bill, body: "mudou centavos" }, budget]).dedupeKey);
    expect(() => groupNotificationEvents([bill, { ...bill, userId: "other" }])).toThrow();
  });
  it("categoria desligada é removida antes do agrupamento; todos os detalhes elegíveis ficam no app", async () => {
    const d = { preferences: vi.fn().mockResolvedValue({ ...defaults, syncAlerts: false }), receipt: vi.fn(async e => e.dedupeKey),
      in_app: vi.fn().mockResolvedValue(1), push: vi.fn(), telegram: vi.fn(), batch: vi.fn().mockResolvedValue(0) };
    const bills = Array.from({ length: 12 }, (_, i) => receipt(String(i)).event);
    await new NotificationDispatcher(d).dispatchBatch([...bills, receipt("sync", false, { category: "syncAlerts", body: "Sincronização" }).event], new Date("2026-11-14T11:00Z"));
    expect(d.in_app).toHaveBeenCalledTimes(12); expect(d.batch).toHaveBeenCalledTimes(2);
    expect(d.batch.mock.calls[0][1]).toHaveLength(12);
    const grouped = groupNotificationEvents(d.batch.mock.calls[0][1].map((r: NotificationReceipt) => r.event));
    expect(grouped.body).not.toContain("Sincronização");
    const payload = pushPayload(grouped, defaults, "notice-id");
    expect(payload.noticeId).toBe("notice-id"); expect(payload.body).not.toContain("Conta");
  });
});
