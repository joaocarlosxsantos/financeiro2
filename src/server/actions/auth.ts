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
import { checkRateLimit, isRateLimited } from "@/lib/rate-limit";

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

  const rateLimit = checkRateLimit(`register:${email}`);
  if (!rateLimit.allowed) {
    return { error: "Muitas tentativas. Tente novamente em alguns minutos." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    let userId: string;
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name, email, passwordHash })
        .returning({ id: users.id });
      userId = user.id;

      await tx.insert(categories).values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })));
      await tx.insert(accounts).values([
        { userId, name: "Conta corrente", type: "CHECKING" as const, color: "#2349C9" },
        { userId, name: "Cartão de crédito", type: "CREDIT_CARD" as const, color: "#C0352B" },
      ]);
    });
  } catch (error: unknown) {
    // drizzle embrulha o erro do driver em .cause
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") {
      return { error: "Erro ao criar a conta. Tente novamente." };
    }
    throw error;
  }

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

  // Só consulta: quem conta as falhas é o authorize (lib/auth.ts).
  if (!isRateLimited(`login:${email}`).allowed) {
    return { error: "Muitas tentativas. Tente novamente em alguns minutos." };
  }

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
