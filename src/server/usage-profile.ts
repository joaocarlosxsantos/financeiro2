import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { canVisitRoute, isUsageProfile, profileRestriction, type ProfileCapability, type UsageProfile } from "@/lib/usage-profile";

/** Read current policy from the DB; a JWT or a hidden button is not authorization. */
export async function getUsageProfile(userId: string): Promise<UsageProfile> {
  const [user] = await db.select({ usageProfile: users.usageProfile }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !isUsageProfile(user.usageProfile)) throw new Error("Perfil do usuário indisponível.");
  return user.usageProfile;
}

export async function getProfileRestriction(userId: string, capability: ProfileCapability) {
  return profileRestriction(await getUsageProfile(userId), capability);
}

export async function requireProfileRoute(pathname: string) {
  const userId = await requireUserId();
  const profile = await getUsageProfile(userId);
  if (!canVisitRoute(profile, pathname)) redirect("/painel");
  return { userId, profile };
}
