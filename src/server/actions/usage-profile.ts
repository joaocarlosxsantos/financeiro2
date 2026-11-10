"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { isUsageProfile } from "@/lib/usage-profile";

export async function saveUsageProfile(_previous: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const userId = await requireUserId();
  const profile = form.get("usageProfile");
  if (!isUsageProfile(profile)) return { error: "Escolha um perfil válido." };
  const changed = await db.update(users).set({ usageProfile: profile, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!changed.length) return { error: "Usuário não encontrado." };
  revalidatePath("/", "layout");
  return { ok: true };
}
