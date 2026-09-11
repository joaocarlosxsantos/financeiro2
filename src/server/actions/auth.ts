"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, users } from "@/db/schema";
import { signIn, signOut } from "@/lib/auth";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";

export type FormState = { error?: string; ok?: boolean };

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Digite seu nome."),
    email: z.string().trim().toLowerCase().email("E-mail inválido."),
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não são iguais.",
    path: ["confirm"],
  });

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confira os dados." };
  }

  const { name, email, password } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "Já existe uma conta com esse e-mail." };

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db.insert(users).values({ name, email, passwordHash }).returning({ id: users.id });

  // Categorias e contas prontas para o usuário começar a usar hoje.
  await db.insert(categories).values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })));
  await db.insert(accounts).values([
    { userId: user.id, name: "Conta corrente", type: "CHECKING" as const, color: "#294f59" },
    { userId: user.id, name: "Cartão de crédito", type: "CREDIT_CARD" as const, color: "#f43f5e" },
  ]);

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Conta criada, mas o login falhou. Tente entrar." };
    throw error;
  }

  redirect("/onboarding");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Preencha e-mail e senha." };

  try {
    await signIn("credentials", { email, password, redirectTo: "/painel" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "E-mail ou senha incorretos." };
    throw error;
  }
  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
