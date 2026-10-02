import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import {
  getAvgMonthlyCostCents,
  getBudgetOverview,
  getDebtOverview,
  getCardCategoryBreakdown,
  getCategoryBreakdown,
  getEmergencyFundSavedCents,
  getGoals,
  getMonthSummary,
  getMonthlySeries,
  getOnboardingChecklist,
  getRecurringStatus,
  getTotalSavedCents,
  getUser,
} from "@/server/queries";
import { monthRefFromParam, monthLabel } from "@/lib/dates";
import { formatCents, pct } from "@/lib/money";
import {
  balanceCents,
  emergencyTargetCents,
  fiftyThirtyTwenty,
  financialHealth,
  monthsOfRunway,
  savingsRate,
} from "@/lib/finance";
import { buildBudgetAlerts, buildGoalAlerts } from "@/lib/alerts";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { RecurringBanner } from "@/components/recurring-banner";
import { Money } from "@/components/ui/money";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty";
import { MonthlyFlowChart, FixedVariableChart } from "@/components/charts/monthly-flow";
import { CategoryBars } from "@/components/charts/category-bars";
import { HealthCard } from "./health-card";
import { BudgetCard } from "./budget-card";
import { DebtCard } from "./debt-card";
import { AlertsCard } from "./alerts-card";
import { OnboardingCard } from "./onboarding-card";

export const metadata = { title: "Painel — Financeiro 2.0" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const userId = await requireUserId();
  const { m } = await searchParams;
  const ref = monthRefFromParam(m);

  const [
    user,
    summary,
    series,
    breakdown,
    cardBreakdown,
    avgCost,
    saved,
    emergencySaved,
    budget,
    recurring,
    debts,
    goals,
    onboarding,
  ] = await Promise.all([
    getUser(userId),
    // "cash": o resumo principal do painel é o retrato do dinheiro que
    // realmente entrou e saiu de uma conta de verdade — compra no cartão
    // vira demonstrativo (tem gráfico próprio abaixo) e nunca entra aqui;
    // o que sai do cartão só conta quando aparece no extrato importado.
    getMonthSummary(userId, ref, { cardMode: "cash" }),
    getMonthlySeries(userId, 6, ref, { cardMode: "cash" }),
    getCategoryBreakdown(userId, ref, { cardMode: "cash" }),
    getCardCategoryBreakdown(userId, ref),
    getAvgMonthlyCostCents(userId, 3),
    getTotalSavedCents(userId),
    getEmergencyFundSavedCents(userId),
    getBudgetOverview(userId, ref),
    getRecurringStatus(userId, ref),
    getDebtOverview(userId),
    getGoals(userId),
    getOnboardingChecklist(userId),
  ]);

  const alerts = [...buildBudgetAlerts(budget.rows), ...buildGoalAlerts(goals)];

  const sobrou = balanceCents(summary);
  const rate = savingsRate(summary);
  const costBase = avgCost > 0 ? avgCost : Math.round(user.monthlyIncomeCents * 0.7);
  const emergencyTarget = emergencyTargetCents(costBase, user.emergencyMonths);
  const runway = monthsOfRunway(emergencySaved, costBase);
  const split = fiftyThirtyTwenty(user.monthlyIncomeCents || summary.incomeCents);

  const fixedShare = user.monthlyIncomeCents
    ? pct(summary.fixedCents, user.monthlyIncomeCents)
    : pct(summary.fixedCents, summary.incomeCents || 1);

  const health = financialHealth({
    savingsRatePct: rate,
    runwayMonths: runway,
    emergencyMonthsTarget: user.emergencyMonths,
    fixedShareOfIncomePct: fixedShare,
  });

  const hasData = summary.incomeCents > 0 || summary.expenseCents > 0 || cardBreakdown.length > 0;

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}`}
        description="Resumo do mês: entradas, saídas e saldo."
        action={<MonthSwitcher value={ref} />}
      />

      {/* 1. Hero mês: 'Sobrou' grande + linha Entrou/Saiu/Fixo menores */}
      <section
        className="card p-5 sm:p-6"
        aria-label="Resumo financeiro do mês"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <span className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Sobrou no mês
            </span>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <Money
                cents={sobrou}
                tone={sobrou < 0 ? "out" : undefined}
                size="lg"
                className="text-3xl sm:text-4xl font-semibold"
              />
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {sobrou >= 0
                  ? `Taxa de economia: ${rate}% da renda`
                  : "Gastos superaram as receitas no mês"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-[var(--border)] border-t border-[var(--border)] pt-4">
          <div className="min-w-0 pr-2 sm:pr-4">
            <p className="text-[0.75rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Entrou
            </p>
            <div className="mt-1">
              <Money
                cents={summary.incomeCents}
                tone="in"
                size="md"
                className="text-sm sm:text-base font-medium"
              />
            </div>
            <p className="muted mt-0.5 hidden text-xs sm:block truncate">
              Salário e receitas
            </p>
          </div>

          <div className="min-w-0 px-2 sm:px-4">
            <p className="text-[0.75rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Saiu
            </p>
            <div className="mt-1">
              <Money
                cents={summary.expenseCents}
                tone="out"
                size="md"
                className="text-sm sm:text-base font-medium"
              />
            </div>
            <p className="muted mt-0.5 hidden text-xs sm:block truncate">
              {formatCents(summary.variableCents)} variável
            </p>
          </div>

          <div className="min-w-0 pl-2 sm:pl-4">
            <p className="text-[0.75rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Fixo
            </p>
            <div className="mt-1">
              <Money
                cents={summary.fixedCents}
                size="md"
                className="text-sm sm:text-base font-medium"
              />
            </div>
            <p className="muted mt-0.5 hidden text-xs sm:block truncate">
              {fixedShare > 0 ? `${fixedShare}% da renda` : "Compromissos"}
            </p>
          </div>
        </div>
      </section>

      {/* 2. Alerta/onboarding compacta logo abaixo */}
      <div className="mt-4 space-y-3">
        <OnboardingCard checklist={onboarding} />

        <RecurringBanner
          monthRef={ref}
          monthName={monthLabel(ref)}
          count={recurring.pending.length}
          incomeCents={recurring.pendingIncomeCents}
          expenseCents={recurring.pendingExpenseCents}
        />

        <AlertsCard alerts={alerts} />

        {!hasData ? (
          <Card className="p-0">
            <EmptyState
              icon={Receipt}
              title={`Nenhum lançamento em ${monthLabel(ref)}`}
              description="Adicione seus lançamentos ou importe o extrato do banco e a fatura do cartão."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link
                    href="/lancamentos"
                    className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Adicionar lançamento
                  </Link>
                  <Link
                    href="/importar"
                    className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-[var(--surface-2)]"
                  >
                    Importar extrato
                  </Link>
                </div>
              }
            />
          </Card>
        ) : null}
      </div>

      {/* 3. Gráfico 6m + ranking categorias lado-a-lado (largura maior) */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12" aria-label="Fluxo e categorias">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Entrou, saiu e sobrou nos últimos 6 meses"
            subtitle="Histórico de entradas, saídas e saldo líquido mês a mês."
          />
          <MonthlyFlowChart data={series} />
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader
            title={`Para onde foi o dinheiro em ${monthLabel(ref)}`}
            subtitle="Ranking das categorias que mais pesaram no mês."
          />
          {breakdown.length ? (
            <CategoryBars slices={breakdown} />
          ) : (
            <p className="muted py-8 text-center text-[0.8125rem]">
              Sem despesas registradas neste mês.
            </p>
          )}
        </Card>
      </section>

      {cardBreakdown.length ? (
        <section className="mt-4" aria-label="Gastos no cartão de crédito">
          <Card>
            <CardHeader
              title={`Gastos no cartão em ${monthLabel(ref)}`}
              subtitle="Demonstrativo de compras faturadas no cartão de crédito."
              action={
                <Link
                  href="/lancamentos?acc=CARD"
                  className="text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  Ver lançamentos do cartão
                </Link>
              }
            />
            <CategoryBars slices={cardBreakdown} />
          </Card>
        </section>
      ) : null}

      {/* 4. Seções planas (saúde, orçamento, reserva, dívidas, 50/30/20) em 2 colunas desktop */}
      <section
        className="mt-8 border-t border-[var(--border)] pt-8"
        aria-label="Planejamento e saúde financeira"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Coluna 1: Saúde Financeira, Orçamento & Fixo x Variável */}
          <div className="space-y-8 [&_.card]:border-0 [&_.card]:bg-transparent [&_.card]:p-0 [&_.card]:shadow-none [&_.card]:rounded-none">
            <div>
              <HealthCard health={health} className="border-0 bg-transparent p-0 rounded-none shadow-none" />
            </div>

            <div className="border-t border-[var(--border)] pt-6">
              <BudgetCard overview={budget} monthRef={ref} className="border-0 bg-transparent p-0 rounded-none shadow-none" />
            </div>

            <div className="border-t border-[var(--border)] pt-6">
              <div className="mb-4 border-b border-[var(--line)] pb-3">
                <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Gasto fixo x variável
                </h2>
                <p className="muted mt-1 text-[0.8125rem] leading-snug">
                  Evolução de compromissos fixos e gastos controláveis nos últimos 6 meses.
                </p>
              </div>
              <FixedVariableChart data={series} />
              <div className="mt-3">
                <Hint tone={fixedShare > 60 ? "warn" : "tip"}>
                  {fixedShare > 0 ? (
                    <>
                      Gastos fixos consomem <strong>{fixedShare}%</strong> da renda.{" "}
                      {fixedShare > 60
                        ? "Acima de 60% o orçamento engessa e reduz flexibilidade."
                        : "Abaixo de 50% é o equilíbrio ideal para absorver imprevistos."}
                    </>
                  ) : (
                    <>Classifique lançamentos como fixo ou variável para esta análise.</>
                  )}
                </Hint>
              </div>
            </div>
          </div>

          {/* Coluna 2: Reserva de Emergência, Dívidas & 50/30/20 */}
          <div className="space-y-8 [&_.card]:border-0 [&_.card]:bg-transparent [&_.card]:p-0 [&_.card]:shadow-none [&_.card]:rounded-none">
            {/* Reserva de Emergência */}
            <div id="reserva-emergencia" className="scroll-mt-20">
              <div className="mb-4 flex items-start justify-between gap-4 border-b border-[var(--line)] pb-3">
                <div className="min-w-0">
                  <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Reserva de emergência
                  </h2>
                  <p className="muted mt-1 text-[0.8125rem] leading-snug">
                    Meta de {user.emergencyMonths} meses de custo de vida.
                  </p>
                </div>
                <Link
                  href="/metas"
                  className="shrink-0 text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  Gerenciar
                </Link>
              </div>

              <div className="mb-2 flex items-baseline justify-between">
                <Money cents={emergencySaved} size="lg" className="text-2xl font-semibold" />
                <span className="muted text-[0.8125rem]">
                  de <Money cents={emergencyTarget} size="sm" />
                </span>
              </div>
              <Progress
                label="Progresso da reserva de emergência"
                value={emergencyTarget ? (emergencySaved / emergencyTarget) * 100 : 0}
                color="var(--color-save)"
                height={8}
              />
              <p className="muted mt-2 text-xs leading-relaxed">
                Base de cálculo: custo de vida de <strong>{formatCents(costBase)}</strong> por mês
                {avgCost > 0 ? " (média real recente)" : " (estimado em 70% da renda)"}
                {saved > emergencySaved ? ` · Total em metas: ${formatCents(saved)}` : ""}.
              </p>
              <div className="mt-3">
                <Hint tone={runway >= user.emergencyMonths ? "good" : "info"}>
                  {runway >= user.emergencyMonths
                    ? "Reserva completa. O excedente pode ir para investimentos de longo prazo."
                    : `Cobre ${runway} ${runway === 1 ? "mês" : "meses"} sem renda. Faltam ${formatCents(Math.max(0, emergencyTarget - emergencySaved))} para a meta.`}
                </Hint>
              </div>
            </div>

            {/* Dívidas (se houver) */}
            {debts.debts.length > 0 ? (
              <div className="border-t border-[var(--border)] pt-6">
                <DebtCard
                  overview={debts}
                  incomeCents={user.monthlyIncomeCents}
                  className="border-0 bg-transparent p-0 rounded-none shadow-none"
                />
              </div>
            ) : null}

            {/* 50/30/20 */}
            <div className="border-t border-[var(--border)] pt-6">
              <div className="mb-4 border-b border-[var(--line)] pb-3">
                <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Como dividir a sua renda
                </h2>
                <p className="muted mt-1 text-[0.8125rem] leading-snug">
                  Referência 50/30/20 aplicada à sua renda mensal.
                </p>
              </div>

              <ul className="space-y-4">
                <SplitRow
                  label="Essenciais"
                  hint="Moradia, contas, mercado, transporte, saúde"
                  target={split.necessitiesCents}
                  actual={summary.fixedCents}
                  color="var(--text-brand)"
                  share={50}
                />
                <SplitRow
                  label="Estilo de vida"
                  hint="Lazer, delivery, assinaturas, compras"
                  target={split.wantsCents}
                  actual={summary.variableCents}
                  color="var(--color-variable)"
                  share={30}
                />
                <SplitRow
                  label="Futuro"
                  hint="Reserva, investimentos e quitação de dívidas"
                  target={split.futureCents}
                  actual={Math.max(0, sobrou)}
                  color="var(--color-money-in)"
                  share={20}
                />
              </ul>
              <p className="muted mt-3 text-xs leading-relaxed">
                Referência para equilibrar gastos essenciais, estilo de vida e metas.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function SplitRow({
  label,
  hint,
  target,
  actual,
  color,
  share,
}: {
  label: string;
  hint: string;
  target: number;
  actual: number;
  color: string;
  share: number;
}) {
  const ratio = target ? (actual / target) * 100 : 0;
  return (
    <li>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[0.875rem] font-medium">
          <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
          {label}
          <span className="muted text-xs font-normal">{share}%</span>
        </span>
        <span className="text-[0.8125rem]">
          <strong><Money cents={actual} size="sm" /></strong>
          <span className="muted"> / <Money cents={target} size="sm" /></span>
        </span>
      </div>
      <Progress value={ratio} color={color} label={`${label}: quanto do sugerido já foi usado`} />
      <p className="muted mt-1 text-xs">{hint}</p>
    </li>
  );
}
