import { UsageProfileProvider } from "@/components/usage-profile";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/sidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { getAccounts, getCategories } from "@/server/queries";
import type { Viewport } from "next";

export const viewport: Viewport = { viewportFit: "cover", interactiveWidget: "resizes-content" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const [user] = await db
    .select({ name: users.name, usageProfile: users.usageProfile, onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  // Sessão apontando para usuário inexistente: limpa o cookie antes de sair,
  // senão o login devolve para cá e vira laço.
  if (!user) redirect("/sessao-invalida");
  if (!user.onboardedAt) redirect("/onboarding");

  const [accounts, categories] = await Promise.all([getAccounts(userId), getCategories(userId)]);

  return (
    <UsageProfileProvider profile={user.usageProfile}><ConfirmProvider>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        <Sidebar userName={user.name}
          accounts={accounts.filter((account) => account.financeMode === "manual").map(({ id, name }) => ({ id, name }))}
          categories={categories.map(({ id, name, kind, nature, color }) => ({ id, name, kind, nature, color }))} />
        <div className="min-w-0 flex-1">
          <main id="conteudo" className="mx-auto min-w-0 max-w-[1120px] px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 lg:max-w-none lg:py-10 xl:px-8">
            {children}
          </main>
        </div>
      </div>
    </ConfirmProvider></UsageProfileProvider>
  );
}
