import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/sidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const [user] = await db
    .select({ name: users.name, email: users.email, onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  // Sessão apontando para usuário inexistente: limpa o cookie antes de sair,
  // senão o login devolve para cá e vira laço.
  if (!user) redirect("/api/sessao-invalida");
  if (!user.onboardedAt) redirect("/onboarding");

  return (
    <ConfirmProvider>
      <div className="flex min-h-screen">
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        <Sidebar userName={user.name} userEmail={user.email} />
        <div className="min-w-0 flex-1">
          <main id="conteudo" className="mx-auto max-w-6xl px-5 py-6 pb-24 sm:px-8 lg:py-10">
            {children}
          </main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
