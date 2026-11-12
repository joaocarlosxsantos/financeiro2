import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][], conditions: [] as unknown[], values: [] as Record<string, unknown>[],
  updates: [] as { table: unknown; condition: unknown; changes: Record<string, unknown> }[], pending: [] as unknown[],
}));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => "owner-a" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/usage-profile", () => ({ getProfileRestriction: async () => null }));
vi.mock("@/server/queries", () => ({ getGoalRecurringStatus: async () => ({ pending: mocks.pending }) }));
vi.mock("@/db", () => {
  const connection = {
    select: () => ({ from: () => ({ where: (condition: unknown) => {
      mocks.conditions.push(condition);
      return { limit: async () => mocks.rows.shift() ?? [] };
    } }) }),
    update: (table: unknown) => ({ set: (changes: Record<string, unknown>) => ({ where: async (condition: unknown) => { mocks.updates.push({ table, condition, changes }); } }) }),
    insert: () => ({ values: (value: Record<string, unknown>) => {
      mocks.values.push(value);
      return { onConflictDoNothing: () => ({ returning: async () => [{ id: "new-contribution" }] }) };
    } }),
  };
  return { db: { ...connection, transaction: async (work: (tx: unknown) => unknown) => work(connection) } };
});

import { upsertEmergencyGoal } from "./goals";
import { createGoalRecurringRule, generateGoalRecurring } from "./goal-recurring";
import { saveProfile } from "./settings";
import { goals } from "@/db/schema";

beforeEach(() => {
  mocks.rows = []; mocks.conditions = []; mocks.values = []; mocks.updates = []; mocks.pending = [];
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const profile = { name: "Maria", income: "1000", emergencyMonths: "6", savingsTargetPct: "20" };
const rule = { goalId: "goal-a", amount: "50", dayOfMonth: "10", startMonth: "2026-11", note: "Aporte" };

it("update de reserva inclui ID e usuário autenticado no WHERE", async () => {
  mocks.rows.push([{ id: "existing-goal" }]);
  await upsertEmergencyGoal(10000);
  expect(mocks.updates[0].table).toBe(goals);
  const query = new PgDialect().sqlToQuery(mocks.updates[0].condition as SQL);
  expect(query.sql).toContain('"goals"."user_id" =');
  expect(query.params).toEqual(["existing-goal", "owner-a"]);
});

it("geração de aporte filtra update da meta pelo usuário autenticado", async () => {
  mocks.pending = [{ id: "rule-a", goalId: "goal-a", amountCents: 5000, dayOfMonth: 10 }];
  expect(await generateGoalRecurring({ year: 2026, month: 11 })).toEqual({ created: 1 });
  const query = new PgDialect().sqlToQuery(mocks.updates[0].condition as SQL);
  expect(query.sql).toContain('"goals"."user_id" =');
  expect(query.params).toEqual(["goal-a", "owner-a"]);
});

it("perfil normaliza controles no nome e limita comprimento antes de gravar", async () => {
  expect(await saveProfile({}, form({ ...profile, name: "x".repeat(101) }))).toHaveProperty("error");
  expect(mocks.updates).toHaveLength(0);
  expect(await saveProfile({}, form({ ...profile, name: "\u0000\u001b" }))).toHaveProperty("error");
  expect(mocks.updates).toHaveLength(0);
  expect(await saveProfile({}, form({ ...profile, name: "  Maria\nSilva\u0000  " }))).toEqual({ ok: true });
  expect(mocks.updates[0].changes.name).toBe("Maria Silva");
});

it("notas recorrentes rejeitam excesso e removem controles preservando quebras", async () => {
  expect(await createGoalRecurringRule({}, form({ ...rule, note: "x".repeat(2001) }))).toHaveProperty("error");
  expect(mocks.values).toHaveLength(0);
  mocks.rows.push([{ id: "goal-a" }]);
  expect(await createGoalRecurringRule({}, form({ ...rule, note: "  Aporte\u0000\u001b\nMensal  " }))).toEqual({ ok: true });
  expect(mocks.values[0]).toMatchObject({ userId: "owner-a", note: "Aporte\nMensal" });
});
