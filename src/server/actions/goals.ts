"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { goalContributions, goals } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";

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
  if (targetCents <= 0) return { error: "O valor da meta precisa ser maior que zero." };

  await db.insert(goals).values({
    userId,
    name: d.name,
    kind: d.kind,
    targetCents,
    savedCents: Math.abs(parseMoneyToCents(d.saved ?? "0")),
    targetDate: d.targetDate ? new Date(`${d.targetDate}T12:00:00.000Z`) : null,
    color: d.color || "#0ea5e9",
    note: d.note || null,
  });

  refresh();
  return { ok: true };
}

export async function contributeToGoal(goalId: string, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const cents = Math.abs(parseMoneyToCents(String(formData.get("amount") ?? "")));
  if (cents <= 0) return { error: "Informe um valor válido." };

  const delta = String(formData.get("mode") ?? "add") === "withdraw" ? -cents : cents;

  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1);
  if (!goal) return { error: "Meta não encontrada." };

  await db.transaction(async (tx) => {
    await tx.insert(goalContributions).values({
      goalId,
      deltaCents: delta,
      note: String(formData.get("note") ?? "") || null,
    });
    await tx
      .update(goals)
      .set({ savedCents: Math.max(0, goal.savedCents + delta), updatedAt: new Date() })
      .where(eq(goals.id, goalId));
  });

  refresh();
  return { ok: true };
}

export async function deleteGoal(goalId: string) {
  const userId = await requireUserId();
  await db.delete(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
  refresh();
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
