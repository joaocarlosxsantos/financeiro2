"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { goalContributions, goals } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { effectiveDelta } from "@/lib/effectiveDelta";
import { parseMoneyToCents, MAX_CENTS } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/metas");
  revalidatePath("/painel");
  revalidatePath("/projecoes");
}

const goalSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome para a meta."),
  kind: z.enum(["EMERGENCY_FUND", "PURCHASE", "TRIP", "DEBT_PAYOFF", "INVESTMENT", "CUSTOM"]),
  target: z.string().min(1, "Informe o valor da meta."),
  saved: z.string().optional(),
  targetDate: z.string().optional(),
  color: z.string().optional(),
  note: z.string().optional(),
});

export async function createGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = goalSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    target: formData.get("target"),
    saved: formData.get("saved") || undefined,
    targetDate: formData.get("targetDate") || undefined,
    color: formData.get("color") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const d = parsed.data;
  const targetCents = Math.abs(parseMoneyToCents(d.target));
  if (targetCents > MAX_CENTS) return { error: "Valor muito alto." };
  if (targetCents <= 0) return { error: "O valor da meta precisa ser maior que zero." };

  const savedCents = Math.abs(parseMoneyToCents(d.saved ?? "0"));
  if (savedCents > MAX_CENTS) return { error: "Valor muito alto." };

  await db.insert(goals).values({
    userId,
    name: d.name,
    kind: d.kind,
    targetCents,
    savedCents,
    targetDate: d.targetDate ? new Date(`${d.targetDate}T12:00:00.000Z`) : null,
    // a coluna guarda só hex (#rrggbb); qualquer outra coisa cai na cor padrão
    color: d.color && /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : "#2349C9",
    note: d.note || null,
  });

  refresh();
  return { ok: true };
}

export async function contributeToGoal(goalId: string, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const cents = Math.abs(parseMoneyToCents(String(formData.get("amount") ?? "")));
  if (cents > MAX_CENTS) return { error: "Valor muito alto." };
  if (cents <= 0) return { error: "Informe um valor válido." };

  const delta = String(formData.get("mode") ?? "add") === "withdraw" ? -cents : cents;

  // Lê o saldo travando a linha (FOR UPDATE): o delta efetivo (piso em 0) é calculado sobre o
  // saldo atual e o mesmo valor vai para o UPDATE e para o histórico, sem corrida entre cliques.
  const found = await db.transaction(async (tx) => {
    const [goal] = await tx
      .select({ savedCents: goals.savedCents })
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
      .for("update")
      .limit(1);
    if (!goal) return false;

    const applied = effectiveDelta(goal.savedCents, delta);
    if (applied === 0) return true;
    if (goal.savedCents + applied > MAX_CENTS) return "max" as const;

    await tx
      .update(goals)
      .set({ savedCents: goal.savedCents + applied, updatedAt: new Date() })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
    await tx.insert(goalContributions).values({
      goalId,
      deltaCents: applied,
      note: String(formData.get("note") ?? "") || null,
    });
    return true;
  });
  if (!found) return { error: "Meta não encontrada." };
  if (found === "max") return { error: "Valor muito alto." };

  refresh();
  return { ok: true };
}

export async function deleteGoal(goalId: string): Promise<ActionState> {
  const userId = await requireUserId();
  const result = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning({ id: goals.id });
  if (result.length === 0) return { error: "Não encontrado." };
  refresh();
  return { ok: true };
}

/** Cria (ou atualiza) a meta de reserva de emergência calculada pelo sistema. */
export async function upsertEmergencyGoal(targetCents: number) {
  const userId = await requireUserId();

  const [existing] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.kind, "EMERGENCY_FUND")))
    .limit(1);

  if (existing) {
    await db
      .update(goals)
      .set({ targetCents, archived: false, updatedAt: new Date() })
      .where(eq(goals.id, existing.id));
  } else {
    await db.insert(goals).values({
      userId,
      name: "Reserva de emergência",
      kind: "EMERGENCY_FUND",
      targetCents,
      color: "#0891b2",
      note: "Dinheiro para imprevistos. Deve ficar em algo com liquidez diária.",
    });
  }

  refresh();
}
