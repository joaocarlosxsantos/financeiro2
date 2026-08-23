import { Target } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getAvgMonthlyCostCents, getGoals, getMonthSummary, getUser } from "@/server/queries";
import { currentMonthRef } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { balanceCents, emergencyTargetCents, monthsToTarget } from "@/lib/finance";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { EmptyState } from "@/components/ui/empty";
import { EmergencyPanel } from "./emergency-panel";
import { GoalCard } from "./goal-card";
import { GoalComposer } from "./goal-composer";

export const metadata = { title: "Metas e reserva — Financeiro 2.0" };

export default async function GoalsPage() {
  const userId = await requireUserId();
  const ref = currentMonthRef();

  const [user, goals, avgCost, summary] = await Promise.all([
    getUser(userId),
    getGoals(userId),
    getAvgMonthlyCostCents(userId, 3),
    getMonthSummary(userId, ref),
  ]);

  const costBase = avgCost > 0 ? avgCost : Math.round(user.monthlyIncomeCents * 0.7);
  const emergencyTarget = emergencyTargetCents(costBase, user.emergencyMonths);
  const emergency = goals.find((g) => g.kind === "EMERGENCY_FUND") ?? null;
  const others = goals.filter((g) => g.kind !== "EMERGENCY_FUND");

  const monthlyCapacity = Math.max(
    0,
    balanceCents(summary) || Math.round((user.monthlyIncomeCents * user.savingsTargetPct) / 100),
  );

  return (
    <>
      <PageHeader
        title="Metas e reserva"
        description="Primeiro o colchão de segurança, depois os sonhos. Cada meta mostra quanto falta e em quanto tempo você chega no ritmo atual."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <EmergencyPanel
            target={emergencyTarget}
            saved={emergency?.savedCents ?? 0}
            months={user.emergencyMonths}
            costBase={costBase}
            usingRealCost={avgCost > 0}
            goalId={emergency?.id ?? null}
            monthlyCapacity={monthlyCapacity}
          />

          <Card className="p-0">
            <div className="border-b px-5 py-4">
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">Suas metas</h2>
              <p className="muted mt-0.5 text-[0.8125rem]">
                Viagem, carro, entrada do apartamento, quitar uma dívida — tudo entra aqui.
              </p>
            </div>

            {others.length ? (
              <div className="divide-y">
                {others.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={{
                      id: goal.id,
                      name: goal.name,
                      kind: goal.kind,
                      targetCents: goal.targetCents,
                      savedCents: goal.savedCents,
                      targetDate: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null,
                      color: goal.color,
                      note: goal.note,
                    }}
                    monthsAtCurrentPace={monthsToTarget(
                      goal.savedCents,
                      monthlyCapacity,
                      0,
                      goal.targetCents,
                    )}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Target}
                title="Nenhuma meta ainda"
                description="Uma meta com nome e prazo tem muito mais chance de sair do papel do que 'guardar dinheiro'."
              />
            )}
          </Card>

          <Hint tone="info" title="Está endividado? A ordem muda.">
            Se você paga juros de rotativo ou cheque especial, quitar essa dívida rende mais que
            qualquer investimento. Monte uma reserva mínima de 1 mês, cadastre a dívida como meta de
            quitação e ataque a de maior juros primeiro.
          </Hint>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader
              title="Nova meta"
              subtitle={
                monthlyCapacity > 0
                  ? `Você tem sobrado cerca de ${formatCents(monthlyCapacity)} por mês.`
                  : "Cadastre lançamentos para o sistema estimar quanto você consegue guardar."
              }
            />
            <GoalComposer />
          </Card>
        </div>
      </div>
    </>
  );
}
