"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { sharedExpenseShares, sharedExpenses, sharedGroups, sharedMembers, sharedSettlements } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { MAX_CENTS } from "@/lib/money";
import { allocateGroupExpense, canSettle } from "@/lib/shared-balances";
import { safeDescriptionSchema, safeNameSchema } from "@/server/validation/sanitization";
import { GROUP_ID_PATTERN, isSharedSchemaMissing, listGroupMembers, MAX_GROUP_ENTRIES, ownedGroupCondition, readSharedLedger, SHARED_GROUP_PATH } from "@/server/shared-groups";

export type GroupActionResult = { ok: true; groupId: string } | { ok: false; error: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const id = z.string().regex(GROUP_ID_PATTERN, "Identificador inválido.");
const cents = z.number().int().min(1).max(MAX_CENTS);
const createSchema = z.strictObject({ name: safeNameSchema(2), members: z.array(safeNameSchema()).min(2).max(20) });
const expenseSchema = z.strictObject({
  groupId: id,
  payerId: id,
  description: safeDescriptionSchema(),
  amountCents: cents,
  mode: z.enum(["EQUAL", "VALUE"]),
  members: z.array(z.strictObject({ memberId: id, amountCents: z.number().int().min(0).max(MAX_CENTS).optional() })).min(2).max(20),
});
const settlementSchema = z.strictObject({ groupId: id, fromId: id, toId: id, amountCents: cents });

function reject(error: string): GroupActionResult { return { ok: false, error }; }
function saved(groupId: string): GroupActionResult { return { ok: true, groupId }; }

async function persist(work: (tx: Transaction) => Promise<GroupActionResult>): Promise<GroupActionResult> {
  let result: GroupActionResult;
  try {
    result = await db.transaction(work);
  } catch (error) {
    if (isSharedSchemaMissing(error)) return reject("Os grupos estarão disponíveis após a atualização do banco.");
    return reject("Não foi possível salvar. Tente novamente.");
  }
  if (result.ok) {
    revalidatePath(SHARED_GROUP_PATH);
    revalidatePath(`${SHARED_GROUP_PATH}/${result.groupId}`);
  }
  return result;
}

async function lockGroup(tx: Transaction, userId: string, groupId: string) {
  const [group] = await tx.select({ id: sharedGroups.id }).from(sharedGroups)
    .where(ownedGroupCondition(userId, groupId)).for("update").limit(1);
  return group;
}

export async function createSharedGroup(input: unknown): Promise<GroupActionResult> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return reject("Informe o nome do grupo e de 2 a 20 participantes.");
  const { name, members } = parsed.data;
  if (new Set(members.map((member) => member.toLowerCase())).size !== members.length) return reject("Use um nome diferente para cada pessoa.");
  return persist(async (tx) => {
    const [group] = await tx.insert(sharedGroups).values({ userId, name }).returning({ id: sharedGroups.id });
    await tx.insert(sharedMembers).values(members.map((member) => ({ groupId: group.id, name: member })));
    return saved(group.id);
  });
}

export async function addSharedExpense(input: unknown): Promise<GroupActionResult> {
  const userId = await requireUserId();
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return reject("Confira o pagador, a descrição, o valor e as partes da despesa.");
  const { groupId, payerId, description, amountCents, mode, members } = parsed.data;
  return persist(async (tx) => {
    const group = await lockGroup(tx, userId, groupId);
    if (!group) return reject("Grupo não encontrado.");
    const roster = await listGroupMembers(tx, group.id);
    const submitted = new Map(members.map((member) => [member.memberId, member]));
    const selected = roster.filter((member) => submitted.has(member.id));
    if (!roster.some((member) => member.id === payerId) || selected.length !== members.length) {
      return reject("Escolha apenas participantes deste grupo, sem repetir nomes.");
    }
    const result = allocateGroupExpense(amountCents, mode, selected.map((member) => ({
      memberId: member.id, name: member.name, amountCents: submitted.get(member.id)?.amountCents,
    })));
    if (!result.ok) return reject(result.error);
    const [expenseCount] = await tx.select({ total: count() }).from(sharedExpenses).where(eq(sharedExpenses.groupId, group.id));
    if (expenseCount.total >= MAX_GROUP_ENTRIES) return reject("Este grupo chegou ao limite de despesas.");
    const [expense] = await tx.insert(sharedExpenses).values({ groupId: group.id, payerId, description, amountCents }).returning({ id: sharedExpenses.id });
    await tx.insert(sharedExpenseShares).values(result.shares.map((share) => ({ ...share, groupId: group.id, expenseId: expense.id })));
    return saved(group.id);
  });
}

export async function recordSharedSettlement(input: unknown): Promise<GroupActionResult> {
  const userId = await requireUserId();
  const parsed = settlementSchema.safeParse(input);
  if (!parsed.success) return reject("Confira as pessoas e o valor do acerto.");
  const { groupId, ...payment } = parsed.data;
  return persist(async (tx) => {
    // Serialize writers. Recompute after the lock so concurrent acertos cannot overpay.
    const group = await lockGroup(tx, userId, groupId);
    if (!group) return reject("Grupo não encontrado.");
    const { debts, settlements } = await readSharedLedger(tx, group.id);
    if (!canSettle(debts, payment)) return reject("O valor excede o saldo atual entre essas pessoas. Confira os saldos e tente novamente.");
    if (settlements.length >= MAX_GROUP_ENTRIES) return reject("Este grupo chegou ao limite de acertos.");
    await tx.insert(sharedSettlements).values({ groupId: group.id, ...payment });
    return saved(group.id);
  });
}
