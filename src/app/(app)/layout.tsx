import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const [user] = await db
    .select({ name: users.name, email: users.email, onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) redirect("/login");
  if (!user.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={user.name} userEmail={user.email} />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-5 py-6 pb-24 sm:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
