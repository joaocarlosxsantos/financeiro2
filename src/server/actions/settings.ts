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

/**
 * Define o saldo inicial da conta e a data em que ele valia.
 * Lançamentos anteriores a essa data param de contar no saldo — é assim que
 * você concilia com o extrato do banco sem apagar histórico.
 */
export async function saveOpeningBalance(input: {
  accountId: string;
  amount: string;
  date?: string | null;
}): Promise<ActionState> {
  const userId = await requireUserId();

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) return { error: "Conta não encontrada." };

  await db
    .update(accounts)
    .set({
      openingBalanceCents: parseMoneyToCents(input.amount),
      openingBalanceDate: input.date ? new Date(`${input.date}T00:00:00.000Z`) : null,
    })
    .where(eq(accounts.id, input.accountId));

  revalidatePath("/contas");
  revalidatePath("/configuracoes");
  revalidatePath("/painel");
  return { ok: true };
}

export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Categoria não encontrada." };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    nature: formData.get("nature"),
    color: formData.get("color") || undefined,
    keywords: formData.get("keywords") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  if (!existing) return { error: "Categoria não encontrada." };

  const keywords = (parsed.data.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  try {
    await db
      .update(categories)
      .set({
        name: parsed.data.name,
        kind: parsed.data.kind,
        nature: parsed.data.kind === "INCOME" ? "VARIABLE" : parsed.data.nature,
        color: parsed.data.color || "#64748b",
        keywords,
      })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  } catch {
    return { error: "Já existe uma categoria com esse nome." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/lancamentos");
  revalidatePath("/orcamento");
  revalidatePath("/painel");
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
  revalidatePath("/contas");
  revalidatePath("/importar");
}

export async function updateAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Conta não encontrada." };

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    institution: formData.get("institution") || undefined,
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);
  if (!existing) return { error: "Conta não encontrada." };

  await db
    .update(accounts)
    .set({
      name: parsed.data.name,
      type: parsed.data.type,
      institution: parsed.data.institution || null,
      color: parsed.data.color || "#6366f1",
    })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));

  revalidatePath("/configuracoes");
  revalidatePath("/contas");
  revalidatePath("/importar");
  revalidatePath("/lancamentos");
  return { ok: true };
}

/** Reverte o arquivamento — a conta volta a aparecer em todo o sistema. */
export async function restoreAccount(id: string) {
  const userId = await requireUserId();
  await db
    .update(accounts)
    .set({ archived: false })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  revalidatePath("/configuracoes");
  revalidatePath("/contas");
  revalidatePath("/importar");
}

/**
 * Apaga a conta de vez — só funciona em conta já arquivada (o `where` exige
 * `archived = true`, então mesmo uma chamada indevida não apaga uma conta em
 * uso). Por causa do `onDelete: "cascade"` no schema, isso também apaga para
 * sempre os lançamentos, recorrências e lotes de importação daquela conta —
 * a UI precisa avisar isso antes de chamar.
 */
export async function deleteAccountPermanently(id: string) {
  const userId = await requireUserId();
  await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId), eq(accounts.archived, true)));
  revalidatePath("/configuracoes");
  revalidatePath("/contas");
  revalidatePath("/painel");
  revalidatePath("/lancamentos");
}
