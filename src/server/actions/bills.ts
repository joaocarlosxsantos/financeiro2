"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  billGroupings,
  billParticipants,
  billRuleParticipants,
  billRules,
  bills,
} from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents, formatCents } from "@/lib/money";
import { checkManualSplit, splitBillEqually } from "@/lib/bills";
import type { MonthRef } from "@/lib/dates";

export type ActionState = { error?: string; ok?: boolean };

/**
 * "Contas a pagar" fica inteiramente fora dos lançamentos e relatórios
 * financeiros — decisão do João: é só organização e controle, não mexe no
 * Painel nem em nenhum relatório. Por isso `refresh` só revalida a própria
 * seção.
 */
function refresh() {
  revalidatePath("/contas-a-pagar");
}

/**
 * Confere que o agrupamento pertence mesmo a quem está criando a conta —
 * mesma checagem que `updateBillGrouping` já faz ao mover uma conta existente,
 * só que também na criação (sem isso, dava pra criar uma conta apontando para
 * o `groupingId` de outra pessoa, vazando o nome/cor do agrupamento dela).
 */
async function verifyGroupingOwnership(userId: string, groupingId: string | null): Promise<string | null> {
  if (!groupingId) return null;
  const [grouping] = await db
    .select({ id: billGroupings.id })
    .from(billGroupings)
    .where(and(eq(billGroupings.id, groupingId), eq(billGroupings.userId, userId)))
    .limit(1);
  return grouping ? null : "Agrupamento não encontrado.";
}

// ---------------------------------------------------------------- agrupamentos

const groupingSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao agrupamento."),
  color: z.string().min(1),
});

export async function createBillGrouping(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = groupingSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  await db.insert(billGroupings).values({ userId, name: parsed.data.name, color: parsed.data.color });
  refresh();
  return { ok: true };
}

export async function archiveBillGrouping(id: string) {
  const userId = await requireUserId();
  // O diálogo de confirmação avisa que as contas ficam "sem agrupamento" — por
  // isso o groupingId é zerado nas contas e nas regras, não só marcado como
  // arquivado no agrupamento em si. Sem isso, o nome do agrupamento arquivado
  // continuaria aparecendo como cabeçalho na lista de contas do mês.
  await db.transaction(async (tx) => {
    const [grouping] = await tx
      .select({ id: billGroupings.id })
      .from(billGroupings)
      .where(and(eq(billGroupings.id, id), eq(billGroupings.userId, userId)));
    if (!grouping) return;

    await tx
      .update(billGroupings)
      .set({ archived: true })
      .where(and(eq(billGroupings.id, id), eq(billGroupings.userId, userId)));
    await tx
      .update(bills)
      .set({ groupingId: null })
      .where(and(eq(bills.groupingId, id), eq(bills.userId, userId)));
    await tx
      .update(billRules)
      .set({ groupingId: null })
      .where(and(eq(billRules.groupingId, id), eq(billRules.userId, userId)));
  });
  refresh();
}

// ---------------------------------------------------------------- regras (recorrentes)

function readParticipants(formData: FormData): { name: string; phone: string | null }[] {
  const names = formData.getAll("participantName").map((v) => String(v).trim());
  const phones = formData.getAll("participantPhone").map((v) => String(v).trim());
  const out: { name: string; phone: string | null }[] = [];
  for (let i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    out.push({ name: names[i], phone: phones[i] || null });
  }
  return out;
}

const ruleSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à conta."),
  type: z.enum(["INDIVIDUAL", "GROUP"]),
  groupingId: z.string().optional(),
});

/** Cria o molde de uma conta recorrente. Nenhum valor em dinheiro mora aqui — cada mês tem o seu, preenchido na geração. */
export async function createBillRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    groupingId: formData.get("groupingId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const participants = d.type === "GROUP" ? readParticipants(formData) : [];
  if (d.type === "GROUP" && !participants.length) {
    return { error: "Informe ao menos uma pessoa para dividir a conta." };
  }

  const groupingError = await verifyGroupingOwnership(userId, d.groupingId || null);
  if (groupingError) return { error: groupingError };

  await db.transaction(async (tx) => {
    const [rule] = await tx
      .insert(billRules)
      .values({ userId, name: d.name, type: d.type, groupingId: d.groupingId || null })
      .returning({ id: billRules.id });

    if (participants.length) {
      await tx
        .insert(billRuleParticipants)
        .values(participants.map((p) => ({ ruleId: rule.id, name: p.name, phone: p.phone })));
    }
  });

  refresh();
  return { ok: true };
}

export async function toggleBillRule(id: string, active: boolean) {
  const userId = await requireUserId();
  await db
    .update(billRules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(billRules.id, id), eq(billRules.userId, userId)));
  refresh();
}

/** Apaga a regra. As contas já geradas continuam existindo (ficam avulsas — `ruleId` vira nulo), pelo mesmo motivo de Recorrentes: apagar histórico junto seria perder controle de algo que já aconteceu. */
export async function deleteBillRule(id: string) {
  const userId = await requireUserId();
  await db.delete(billRules).where(and(eq(billRules.id, id), eq(billRules.userId, userId)));
  refresh();
}

/**
 * Formulário único de "nova conta": o campo oculto `recurring` decide se vira
 * uma regra recorrente (sem valor, só o molde) ou uma conta avulsa (já com
 * ano/mês, valor ainda zero) — mesma UI, ação certa por baixo.
 */
export async function createBill(prev: ActionState, formData: FormData): Promise<ActionState> {
  return formData.get("recurring") === "1" ? createBillRule(prev, formData) : createOneOffBill(prev, formData);
}

// ---------------------------------------------------------------- geração mensal

/** Gera a conta deste mês para as regras recorrentes que ainda não geraram. */
export async function generateBillsForMonth(
  ref: MonthRef,
  ruleId?: string,
): Promise<{ created: number; error?: string }> {
  const userId = await requireUserId();
  const { getBillRulesStatus } = await import("@/server/queries");

  const status = await getBillRulesStatus(userId, ref);
  const target = ruleId ? status.pending.filter((r) => r.id === ruleId) : status.pending;
  if (!target.length) return { created: 0, error: "Nada pendente para gerar neste mês." };

  let created = 0;
  await db.transaction(async (tx) => {
    for (const rule of target) {
      const inserted = await tx
        .insert(bills)
        .values({
          userId,
          ruleId: rule.id,
          groupingId: rule.groupingId,
          name: rule.name,
          type: rule.type,
          year: ref.year,
          month: ref.month,
          totalCents: 0,
        })
        // Uma geração por regra por mês (índice único) — clicar duas vezes não duplica.
        .onConflictDoNothing()
        .returning({ id: bills.id });

      if (!inserted.length) continue;
      created++;

      if (rule.type === "GROUP" && rule.participants.length) {
        await tx.insert(billParticipants).values(
          rule.participants.map((p) => ({
            billId: inserted[0].id,
            name: p.name,
            phone: p.phone,
            amountCents: 0,
          })),
        );
      }
    }
  });

  refresh();
  return { created };
}

// ---------------------------------------------------------------- conta avulsa

const oneOffSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à conta."),
  type: z.enum(["INDIVIDUAL", "GROUP"]),
  groupingId: z.string().optional(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * Conta "única daquele mês" — sem regra recorrente por trás. O valor total é
 * opcional na criação (dá pra deixar em branco e preencher depois, igual à
 * regra recorrente) — mas como essa já nasce presa a um mês, não custa deixar
 * preencher de uma vez. Em grupo, um valor informado aqui já nasce dividido
 * igualmente entre as pessoas — é só o ponto de partida, dá pra trocar pra
 * divisão manual depois editando a conta.
 */
export async function createOneOffBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = oneOffSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    groupingId: formData.get("groupingId") || undefined,
    year: formData.get("year"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const participants = d.type === "GROUP" ? readParticipants(formData) : [];
  if (d.type === "GROUP" && !participants.length) {
    return { error: "Informe ao menos uma pessoa para dividir a conta." };
  }

  const groupingError = await verifyGroupingOwnership(userId, d.groupingId || null);
  if (groupingError) return { error: groupingError };

  const totalCents = Math.abs(parseMoneyToCents(formData.get("total") as string | null));
  const shares = totalCents > 0 && participants.length ? splitBillEqually(totalCents, participants.length) : null;

  await db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(bills)
      .values({
        userId,
        ruleId: null,
        groupingId: d.groupingId || null,
        name: d.name,
        type: d.type,
        year: d.year,
        month: d.month,
        totalCents,
      })
      .returning({ id: bills.id });

    if (participants.length) {
      await tx.insert(billParticipants).values(
        participants.map((p, i) => ({
          billId: bill.id,
          name: p.name,
          phone: p.phone,
          amountCents: shares ? shares[i] : 0,
        })),
      );
    }
  });

  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- participantes de uma conta

export async function addBillParticipant(billId: string, name: string, phone?: string): Promise<ActionState> {
  const userId = await requireUserId();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Informe o nome." };

  const [bill] = await db
    .select({ id: bills.id, type: bills.type })
    .from(bills)
    .where(and(eq(bills.id, billId), eq(bills.userId, userId)))
    .limit(1);
  if (!bill) return { error: "Conta não encontrada." };
  if (bill.type !== "GROUP") return { error: "Só contas em grupo têm participantes." };

  await db.insert(billParticipants).values({ billId, name: trimmed, phone: phone?.trim() || null });
  refresh();
  return { ok: true };
}

export async function removeBillParticipant(participantId: string): Promise<ActionState> {
  const userId = await requireUserId();
  const [row] = await db
    .select({ id: billParticipants.id })
    .from(billParticipants)
    .innerJoin(bills, eq(bills.id, billParticipants.billId))
    .where(and(eq(billParticipants.id, participantId), eq(bills.userId, userId)))
    .limit(1);
  if (!row) return { error: "Participante não encontrado." };

  await db.delete(billParticipants).where(eq(billParticipants.id, participantId));
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- valor e divisão

/**
 * Define o valor total da conta do mês. Para conta em grupo, também divide
 * entre as pessoas — igualmente (sempre bate, sem perder centavo) ou
 * manualmente (validado: a soma tem que bater exatamente com o total, nem
 * faltar nem passar — é a regra que o João pediu).
 */
export async function updateBillAmount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const billId = formData.get("billId") as string | null;
  if (!billId) return { error: "Conta inválida." };

  const [bill] = await db
    .select({ id: bills.id, type: bills.type })
    .from(bills)
    .where(and(eq(bills.id, billId), eq(bills.userId, userId)))
    .limit(1);
  if (!bill) return { error: "Conta não encontrada." };

  const totalCents = Math.abs(parseMoneyToCents(formData.get("total") as string | null));
  if (totalCents <= 0) return { error: "O valor total precisa ser maior que zero." };

  if (bill.type === "INDIVIDUAL") {
    await db.update(bills).set({ totalCents, updatedAt: new Date() }).where(eq(bills.id, billId));
    refresh();
    return { ok: true };
  }

  const participants = await db
    .select({ id: billParticipants.id })
    .from(billParticipants)
    .where(eq(billParticipants.billId, billId));
  if (!participants.length) return { error: "Adicione ao menos uma pessoa antes de definir o valor." };

  const mode = formData.get("mode") === "MANUAL" ? "MANUAL" : "EQUAL";

  let amounts: number[];
  if (mode === "EQUAL") {
    amounts = splitBillEqually(totalCents, participants.length);
  } else {
    amounts = participants.map((p) =>
      Math.abs(parseMoneyToCents(formData.get(`amount_${p.id}`) as string | null)),
    );
    const check = checkManualSplit(totalCents, amounts);
    if (!check.ok) {
      return {
        error:
          check.remainingCents > 0
            ? `Falta dividir ${formatCents(check.remainingCents)} ainda.`
            : `A divisão passou o total em ${formatCents(-check.remainingCents)}.`,
      };
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(bills).set({ totalCents, updatedAt: new Date() }).where(eq(bills.id, billId));
    for (let i = 0; i < participants.length; i++) {
      await tx.update(billParticipants).set({ amountCents: amounts[i] }).where(eq(billParticipants.id, participants[i].id));
    }
  });

  refresh();
  return { ok: true };
}

/**
 * Move (ou tira) uma conta de um agrupamento. Se a conta veio de uma regra
 * recorrente, a regra também é atualizada — senão o mês que vem geraria a
 * conta de volta no agrupamento antigo (a regra é quem decide o agrupamento
 * das próximas gerações; ver comentário em `billRules` no schema).
 */
export async function updateBillGrouping(billId: string, groupingId: string | null): Promise<ActionState> {
  const userId = await requireUserId();
  const [bill] = await db
    .select({ id: bills.id, ruleId: bills.ruleId })
    .from(bills)
    .where(and(eq(bills.id, billId), eq(bills.userId, userId)))
    .limit(1);
  if (!bill) return { error: "Conta não encontrada." };

  if (groupingId) {
    const [grouping] = await db
      .select({ id: billGroupings.id })
      .from(billGroupings)
      .where(and(eq(billGroupings.id, groupingId), eq(billGroupings.userId, userId)))
      .limit(1);
    if (!grouping) return { error: "Agrupamento não encontrado." };
  }

  await db.transaction(async (tx) => {
    await tx.update(bills).set({ groupingId, updatedAt: new Date() }).where(eq(bills.id, billId));
    if (bill.ruleId) {
      await tx
        .update(billRules)
        .set({ groupingId, updatedAt: new Date() })
        .where(eq(billRules.id, bill.ruleId));
    }
  });

  refresh();
  return { ok: true };
}

export async function deleteBill(id: string) {
  const userId = await requireUserId();
  await db.delete(bills).where(and(eq(bills.id, id), eq(bills.userId, userId)));
  refresh();
}
