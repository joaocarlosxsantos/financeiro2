import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  session: vi.fn(),
  selects: [] as { table: unknown; params: unknown[] }[],
  writes: [] as { table: unknown; rows: Record<string, unknown>[] }[],
  locks: [] as string[],
}));
vi.mock("@/lib/auth", () => ({ requireUserId: () => state.session() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ db: {
  transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ select, insert }),
  select,
} }));

import { sharedExpenseShares, sharedExpenses, sharedGroups, sharedMembers, sharedSettlements } from "@/db/schema";
import { getSharedGroup, listSharedGroups } from "@/server/shared-groups";
import { addSharedExpense, createSharedGroup, recordSharedSettlement } from "./shared-groups";

const groupId = "g".repeat(26);
const expenseId = "e".repeat(26);
const ana = "a".repeat(26);
const bia = "b".repeat(26);
const outsider = "x".repeat(26);
const owner = "owner-a";

function select(fields: Record<string, unknown>) {
  let table: unknown;
  let params: unknown[] = [];
  function rows() {
    state.selects.push({ table, params });
    if (table === sharedGroups) return params.includes(owner) && (!params.some((param) => typeof param === "string" && param.length === 26) || params.includes(groupId)) ? [{ id: groupId, name: "Casa" }] : [];
    if (!params.includes(groupId)) return [];
    if (table === sharedMembers) return [{ id: ana, name: "Ana" }, { id: bia, name: "Bia" }];
    const stored = state.writes.filter((write) => write.table === table).flatMap((write) => write.rows);
    return "total" in fields ? [{ total: stored.length }] : stored;
  }
  const query = {
    from: (value: unknown) => { table = value; return query; },
    where: (predicate: SQL) => { params = new PgDialect().sqlToQuery(predicate).params; return query; },
    orderBy: () => query,
    for: (strength: string) => { state.locks.push(strength); return query; },
    limit: async () => rows().slice(0, 1),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(rows()).then(resolve, reject),
  };
  return query;
}

function insert(table: unknown) {
  return { values: (input: Record<string, unknown> | Record<string, unknown>[]) => {
    const id = table === sharedGroups ? groupId : expenseId;
    const rows = (Array.isArray(input) ? input : [input]).map((row) => ({ id, ...row }));
    state.writes.push({ table, rows });
    return { returning: async () => [{ id }] };
  } };
}

const expense = { groupId, payerId: ana, description: "Mercado", amountCents: 101, mode: "EQUAL", members: [{ memberId: ana }, { memberId: bia }] };

describe("grupos privados", () => {
  beforeEach(() => {
    state.session.mockReset();
    state.session.mockResolvedValue(owner);
    state.selects.length = state.writes.length = state.locks.length = 0;
  });

  it("cria grupo e participantes apenas para o usuário da sessão", async () => {
    expect(await createSharedGroup({ name: "Casa", members: ["Ana", "Bia"], userId: "other" })).toMatchObject({ ok: false });
    expect(state.writes).toHaveLength(0);
    expect(await createSharedGroup({ name: " Casa ", members: ["Ana", "Bia"] })).toEqual({ ok: true, groupId });
    expect(state.writes[0].rows[0]).toMatchObject({ userId: owner, name: "Casa" });
    expect(state.writes[1]).toMatchObject({ table: sharedMembers, rows: [{ groupId, name: "Ana" }, { groupId, name: "Bia" }] });
  });

  it("nega leitura e mutações de outro dono antes de acessar participantes ou despesas", async () => {
    state.session.mockResolvedValue("other");
    expect(await listSharedGroups("other")).toEqual([]);
    expect(await getSharedGroup("other", groupId)).toBeNull();
    expect(await addSharedExpense(expense)).toEqual({ ok: false, error: "Grupo não encontrado." });
    expect(await recordSharedSettlement({ groupId, fromId: bia, toId: ana, amountCents: 50 })).toEqual({ ok: false, error: "Grupo não encontrado." });
    expect(state.selects.every(({ table }) => table === sharedGroups)).toBe(true);
    expect(state.selects.slice(1).every(({ params }) => params.includes(groupId) && params.includes("other"))).toBe(true);
    expect(state.writes).toHaveLength(0);
  });

  it("rejeita pagador, cota e acerto cruzados entre grupos", async () => {
    expect(await addSharedExpense({ ...expense, payerId: outsider })).toMatchObject({ ok: false });
    expect(await addSharedExpense({ ...expense, members: [{ memberId: ana }, { memberId: outsider }] })).toMatchObject({ ok: false });
    expect(await addSharedExpense({ ...expense, members: [{ memberId: ana }, { memberId: ana }] })).toMatchObject({ ok: false });
    expect(await recordSharedSettlement({ groupId, fromId: outsider, toId: ana, amountCents: 50 })).toMatchObject({ ok: false });
    expect(state.writes).toHaveLength(0);
  });

  it("grava o rateio e recompõe o saldo ao registrar acerto parcial e final", async () => {
    expect(await addSharedExpense(expense)).toEqual({ ok: true, groupId });
    expect(state.writes[0]).toMatchObject({ table: sharedExpenses, rows: [{ groupId, payerId: ana, amountCents: 101 }] });
    expect(state.writes[1]).toMatchObject({ table: sharedExpenseShares, rows: [
      { groupId, expenseId, memberId: ana, amountCents: 51 }, { groupId, expenseId, memberId: bia, amountCents: 50 },
    ] });
    expect((await getSharedGroup(owner, groupId))?.debts).toEqual([{ fromId: bia, toId: ana, amountCents: 50 }]);
    expect(await recordSharedSettlement({ groupId, fromId: bia, toId: ana, amountCents: 20 })).toMatchObject({ ok: true });
    expect(await recordSharedSettlement({ groupId, fromId: bia, toId: ana, amountCents: 31 })).toMatchObject({ ok: false });
    expect(await recordSharedSettlement({ groupId, fromId: bia, toId: ana, amountCents: 30 })).toMatchObject({ ok: true });
    expect((await getSharedGroup(owner, groupId))?.debts).toEqual([]);
    expect(state.writes.filter(({ table }) => table === sharedSettlements)).toHaveLength(2);
    expect(state.locks).toEqual(["update", "update", "update", "update"]);
  });

  it("nega sessão ausente e partes inválidas sem gravar", async () => {
    expect(await addSharedExpense({ ...expense, mode: "VALUE", members: [{ memberId: ana, amountCents: 100 }, { memberId: bia, amountCents: 100 }] })).toMatchObject({ ok: false });
    state.session.mockRejectedValue(new Error("Sem sessão"));
    await expect(addSharedExpense(expense)).rejects.toThrow("Sem sessão");
    await expect(createSharedGroup({ name: "Casa", members: ["Ana", "Bia"] })).rejects.toThrow("Sem sessão");
    await expect(recordSharedSettlement({ groupId, fromId: bia, toId: ana, amountCents: 50 })).rejects.toThrow("Sem sessão");
    expect(state.writes).toHaveLength(0);
  });
});
