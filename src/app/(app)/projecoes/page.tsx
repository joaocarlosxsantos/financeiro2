import { requireUserId } from "@/lib/auth";
import { getMonthSummary, getTotalSavedCents, getUser } from "@/server/queries";
import { currentMonthRef } from "@/lib/dates";
import { balanceCents } from "@/lib/finance";
import { PageHeader } from "@/components/page-header";
import { ProjectionStudio } from "./projection-studio";

export const metadata = { title: "Projeções — Financeiro 2.0" };

export default async function ProjectionsPage() {
  const userId = await requireUserId();
  const ref = currentMonthRef();

  const [user, saved, summary] = await Promise.all([
    getUser(userId),
    getTotalSavedCents(userId),
    getMonthSummary(userId, ref),
  ]);

  const sobra = Math.max(0, balanceCents(summary));
  const suggested = sobra > 0 ? sobra : Math.round((user.monthlyIncomeCents * user.savingsTargetPct) / 100);

  return (
    <>
      <PageHeader
        title="Projeções"
        description="Onde o seu dinheiro chega se você mantiver o ritmo. Mexa nos controles e compare cenários — é o mesmo cálculo de juros compostos que os bancos usam."
      />
      <ProjectionStudio startCents={saved} suggestedMonthlyCents={suggested} />
    </>
  );
}
