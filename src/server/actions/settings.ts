"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

const profileSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome."),
  income: z.string().min(1, "Informe sua renda mensal."),
  emergencyMonths: z.coerce.number().int().min(1).max(24),
  savingsTargetPct: z.coerce.number().int().min(0).max(90),
});

export async function saveProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    income: formData.get("income"),
    emergencyMonths: formData.get("emergencyMonths"),
    savingsTargetPct: formData.get("savingsTargetPct"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  await db
    .update(users)
    .set({
      name: parsed.data.name,
      monthlyIncomeCents: Math.abs(parseMoneyToCents(parsed.data.income)),
      emergencyMonths: parsed.data.emergencyMonths,
      savingsTargetPct: parsed.data.savingsTargetPct,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath("/configuracoes");
  revalidatePath("/painel");
  revalidatePath("/metas");
  return { ok: true };
}

export async function completeOnboarding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const income = Math.abs(parseMoneyToCents(String(formData.get("income") ?? "")));
  if (income <= 0) return { error: "Informe sua renda mensal líquida." };

  const emergencyMonths = Number(formData.get("emergencyMonths") ?? 6);
  const savingsTargetPct = Number(formData.get("savingsTargetPct") ?? 20);

  await db
    .update(users)
    .set({
      monthlyIncomeCents: income,
      emergencyMonths: Number.isFinite(emergencyMonths) ? emergencyMonths : 6,
      savingsTargetPct: Number.isFinite(savingsTargetPct) ? savingsTargetPct : 20,
      onboardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  redirect("/painel");
}

const accountSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome para a conta."),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH", "INVESTMENT"]),
  institution: z.string().optional(),
  color: z.string().optional(),
});

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    institution: formData.get("institution") || undefined,
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  await db.insert(accounts).values({
    userId,
    name: parsed.data.name,
    type: parsed.data.type,
    institution: parsed.data.institution || null,
    color: parsed.data.color || "#6366f1",
  });

  revalidatePath("/configuracoes");
  revalidatePath("/importar");
  return { ok: true };
}

const categorySchema = z.object({
  name: z.string().trim().min(2, "Dê um nome para a categoria."),
  kind: z.enum(["INCOME", "EXPENSE"]),
  nature: z.enum(["FIXED", "VARIABLE"]),
  color: z.string().optional(),
  keywords: z.string().optional(),
});

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    nature: formData.get("nature"),
    color: formData.get("color") || undefined,
    keywords: formData.get("keywords") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const keywords = (parsed.data.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  try {
    await db.insert(categories).values({
      userId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      nature: parsed.data.kind === "INCOME" ? "VARIABLE" : parsed.data.nature,
      color: parsed.data.color || "#64748b",
      keywords,
    });
  } catch {
    return { error: "Já existe uma categoria com esse nome." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/lancamentos");
  return { ok: true };
}

export async function deleteCategory(id: string) {
  const userId = await requireUserId();
  await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  revalidatePath("/configuracoes");
}

export async function deleteAccount(id: string) {
  const userId = await requireUserId();
  await db
    .update(accounts)
    .set({ archived: true })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  revalidatePath("/configuracoes");
}
