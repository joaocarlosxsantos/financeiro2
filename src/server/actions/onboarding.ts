"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { isUsageProfile } from "@/lib/usage-profile";
import { getOnboardingJourney } from "@/server/onboarding";

export async function getMyOnboardingJourney() {
  return getOnboardingJourney();
}

/** Defer calibration only: explicitly choose a mode, preserve existing income/settings and satisfy the existing guard. */
export async function skipOnboardingCalibration(_previous: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const userId = await requireUserId();
  const usageProfile = form.get("usageProfile");
  if (!isUsageProfile(usageProfile)) return { error: "Escolha como quer usar o app antes de continuar." };
  const changed = await db.update(users).set({ usageProfile, onboardedAt: sql`coalesce(${users.onboardedAt}, now())`, updatedAt: new Date() })
    .where(eq(users.id, userId)).returning({ id: users.id });
  if (!changed.length) return { error: "Usuário não encontrado." };
  revalidatePath("/", "layout");
  redirect("/painel");
}
