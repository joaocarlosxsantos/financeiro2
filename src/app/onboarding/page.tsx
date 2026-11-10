import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Primeiros passos" };

export default async function OnboardingPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) redirect("/api/sessao-invalida");

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-14">
      <div className="mb-8">
        <p className="text-[var(--text-brand)] mb-2 text-xs font-medium">
          Passo 1 de 1
        </p>
        <h1 className="text-display font-semibold tracking-tight text-balance">
          Olá, {user.name.split(" ")[0]}. Vamos calibrar o sistema?
        </h1>
        <p className="muted mt-2 text-[0.9375rem] leading-relaxed">
          Com a sua renda mensal a gente já consegue sugerir quanto guardar, qual reserva de emergência
          perseguir e como dividir o dinheiro do mês.
        </p>
      </div>

      <OnboardingForm
        defaults={{
          income: user.monthlyIncomeCents,
          emergencyMonths: user.emergencyMonths,
          savingsTargetPct: user.savingsTargetPct,
        }}
      />
    </div>
  );
}
