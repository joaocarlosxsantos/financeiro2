import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  Receipt,
  Wallet,
} from "lucide-react";
import { requireUserId } from "@/lib/auth";
import {
  getAvgMonthlyCostCents,
  getBudgetOverview,
  getDebtOverview,
  getCardCategoryBreakdown,
  getCategoryBreakdown,
  getMonthSummary,
  getMonthlySeries,
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
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { RecurringBanner } from "@/components/recurring-banner";
import { StatTile } from "@/components/ui/stat";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty";
import { MonthlyFlowChart, FixedVariableChart } from "@/components/charts/monthly-flow";
import { CategoryBars } from "@/components/charts/category-bars";
import { HealthCard } from "./health-card";
import { BudgetCard } from "./budget-card";
import { DebtCard } from "./debt-card";

export const metadata = { title: "Painel — Financeiro 2.0" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const userId = await requireUserId();
  const { m } = await searchParams;
  const ref = monthRefFromParam(m);

  const [user, summary, series, breakdown, cardBreakdown, avgCost, saved, budget, recurring, debts] =
    await Promise.all([
      getUser(userId),
      // "cash": o resumo principal do painel é o retrato do dinheiro que
      // realmente entrou e saiu — compra no cartão vira demonstrativo (tem
      // gráfico próprio abaixo) e o que conta aqui é a fatura paga.
      getMonthSummary(userId, ref, { cardMode: "cash" }),
      getMonthlySeries(userId, 6, ref, { cardMode: "cash" }),
      getCategoryBreakdown(userId, ref, { cardMode: "cash" }),
      getCardCategoryBreakdown(userId, ref),
      getAvgMonthlyCostCents(userId, 3),
      getTotalSavedCents(userId),
      getBudgetOverview(userId, ref),
      getRecurringStatus(userId, ref),
      getDebtOverview(userId),
    ]);

  const sobrou = balanceCents(summary);
  const rate = savingsRate(summary);
  const costBase = avgCost > 0 ? avgCost : Math.round(user.monthlyIncomeCents * 0.7);
  const emergencyTarget = emergencyTargetCents(costBase, user.emergencyMonths);
  const runway = monthsOfRunway(saved, costBase);
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

  const hasData = summary.incomeCents > 0 || summary.expenseCents > 0;

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}`}
        description="Este é o retrato do seu mês. Comece de cima: o que entrou, o que saiu e o que sobrou."
        action={<MonthSwitcher value={ref} />}
      />

      <RecurringBanner
        monthRef={ref}
        monthName={monthLabel(ref)}
        count={recurring.pending.length}
        incomeCents={recurring.pendingIncomeCents}
        expenseCents={recurring.pendingExpenseCents}
      />

      <DebtCard overview={debts} incomeCents={user.monthlyIncomeCents} />

      {!hasData ? (
        <Card className="mb-6 p-0">
          <EmptyState
            icon={Receipt}
            title={`Nenhum lançamento em ${monthLabel(ref)}`}
            description="Adicione seus lançamentos na mão ou importe o extrato do banco e a fatura do cartão — o sistema categoriza para você."
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Entrou no mês"
          cents={summary.incomeCents}
          icon={ArrowUpRight}
          color="#0d9488"
          caption="Salário, renda extra e rendimentos"
        />
        <StatTile
          label="Saiu no mês"
          cents={summary.expenseCents}
          icon={ArrowDownRight}
          color="#f43f5e"
          caption={`${formatCents(summary.fixedCents)} fixo · ${formatCents(summary.variableCents)} variável`}
        />
        <StatTile
          label="Sobrou"
          cents={sobrou}
          icon={Wallet}
          color={sobrou >= 0 ? "#6366f1" : "#f43f5e"}
          caption={
            sobrou >= 0
              ? `Taxa de economia: ${rate}% da renda`
              : "Você gastou mais do que ganhou neste mês"
          }
        />
        <StatTile
          label="Guardado em metas"
          cents={saved}
          icon={PiggyBank}
          color="#0891b2"
          caption={runway > 0 ? `Cobre ${runway} meses de custo de vida` : "Ainda sem aportes"}
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <HealthCard health={health} />

        <Card className="lg:col-span-2">
          <CardHeader
            title="Entrou, saiu e sobrou nos últimos 6 meses"
            subtitle="A linha roxa é o que sobrou. Se ela vive abaixo de zero, o mês está no vermelho."
          />
          <MonthlyFlowChart data={series} />
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title={`Para onde foi o dinheiro em ${monthLabel(ref)}`}
            subtitle="Ranking das categorias que mais pesaram no mês. Não inclui compras no cartão — elas têm o gráfico próprio logo abaixo."
          />
          {breakdown.length ? (
            <CategoryBars slices={breakdown} />
          ) : (
            <p className="muted py-8 text-center text-[0.8125rem]">
              Sem despesas registradas neste mês.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Gasto fixo x variável"
            subtitle="Fixo é compromisso que se repete. Variável é onde dá para agir rápido."
          />
          <FixedVariableChart data={series} />
          <div className="mt-4">
            <Hint tone={fixedShare > 60 ? "warn" : "tip"}>
              {fixedShare > 0 ? (
                <>
                  Seus gastos fixos consomem <strong>{fixedShare}%</strong> da sua renda.{" "}
                  {fixedShare > 60
                    ? "Acima de 60% o orçamento fica engessado: qualquer imprevisto vira dívida."
                    : "Abaixo de 50% é o ideal — sobra espaço para imprevistos e para guardar."}
                </>
              ) : (
                <>Classifique seus lançamentos como fixo ou variável para ver esta análise.</>
              )}
            </Hint>
          </div>
        </Card>
      </section>

      {cardBreakdown.length ? (
        <section className="mt-4">
          <Card>
            <CardHeader
              title={`Gastos no cartão em ${monthLabel(ref)}`}
              subtitle="Demonstrativo — essas compras nunca entram no resumo acima. O que realmente saiu da conta é o que você importa do extrato do banco."
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

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <BudgetCard overview={budget} monthRef={ref} />

        <Card>
          <CardHeader
            title="Reserva de emergência"
            subtitle={`Meta de ${user.emergencyMonths} meses de custo de vida.`}
            action={
              <Link
                href="/metas"
                className="text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                Gerenciar
              </Link>
            }
          />
          <div className="mb-2 flex items-baseline justify-between">
            <span className="tnum text-2xl font-semibold">{formatCents(saved)}</span>
            <span className="muted tnum text-[0.8125rem]">de {formatCents(emergencyTarget)}</span>
          </div>
          <Progress
            label="Progresso da reserva de emergência"
            value={emergencyTarget ? (saved / emergencyTarget) * 100 : 0}
            color="var(--color-save)"
            height={10}
          />
          <p className="muted mt-3 text-[0.8125rem] leading-relaxed">
            Base de cálculo: custo de vida de <strong>{formatCents(costBase)}</strong> por mês
            {avgCost > 0 ? " (média real dos últimos meses)" : " (estimado em 70% da sua renda)"}.
          </p>
          <div className="mt-4">
            <Hint tone={runway >= user.emergencyMonths ? "good" : "info"}>
              {runway >= user.emergencyMonths
                ? "Reserva completa. A partir daqui, o excedente pode ir para investimentos de prazo maior."
                : `Hoje você aguenta ${runway} ${runway === 1 ? "mês" : "meses"} sem renda. Faltam ${formatCents(Math.max(0, emergencyTarget - saved))} para chegar na meta.`}
            </Hint>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Como dividir a sua renda"
            subtitle="Referência 50/30/20 aplicada à sua renda mensal."
          />
          <ul className="space-y-4">
            <SplitRow
              label="Essenciais"
              hint="Moradia, contas, mercado, transporte, saúde"
              target={split.necessitiesCents}
              actual={summary.fixedCents}
              color="#6366f1"
              share={50}
            />
            <SplitRow
              label="Estilo de vida"
              hint="Lazer, delivery, assinaturas, compras"
              target={split.wantsCents}
              actual={summary.variableCents}
              color="#d95926"
              share={30}
            />
            <SplitRow
              label="Futuro"
              hint="Reserva, investimentos e quitação de dívidas"
              target={split.futureCents}
              actual={Math.max(0, sobrou)}
              color="#0d9488"
              share={20}
            />
          </ul>
          <p className="muted mt-4 text-xs leading-relaxed">
            É uma referência, não uma regra rígida. Serve para você perceber rápido qual bloco está
            fora do lugar.
          </p>
        </Card>
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
        <span className="tnum text-[0.8125rem]">
          <strong>{formatCents(actual)}</strong>
          <span className="muted"> / {formatCents(target)}</span>
        </span>
      </div>
      <Progress value={ratio} color={color} label={`${label}: quanto do sugerido já foi usado`} />
      <p className="muted mt-1 text-xs">{hint}</p>
    </li>
  );
}
