import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getBudgetOverview, getUser } from "@/server/queries";
import { monthRefFromParam, monthLabel } from "@/lib/dates";
import { formatCents, pct } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { Progress } from "@/components/ui/progress";
import { BudgetList } from "./budget-list";
import { BudgetStarters } from "./budget-starters";

export const metadata = { title: "Orçamento — Financeiro 2.0" };

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const userId = await requireUserId();
  const { m } = await searchParams;
  const ref = monthRefFromParam(m);

  const [user, overview] = await Promise.all([getUser(userId), getBudgetOverview(userId, ref)]);

  const hasBudgets = overview.rows.some((r) => r.limitCents !== null);
  const estourou = overview.rows.filter((r) => r.status === "estourou");
  const atencao = overview.rows.filter((r) => r.status === "atencao");
  const semLimite = overview.rows.filter((r) => r.status === "sem-limite" && r.spentCents > 0);

  const income = user.monthlyIncomeCents || overview.incomeCents;
  const sobraOrcada = income - overview.totalLimitCents;
  const usoDoOrcamento = overview.totalLimitCents
    ? (overview.budgetedSpentCents / overview.totalLimitCents) * 100
    : 0;

  return (
    <>
      <PageHeader
        title="Orçamento"
        description="Um teto por categoria transforma boa intenção em número. O sistema acompanha o quanto você já consumiu e avisa antes de estourar."
        action={<MonthSwitcher value={ref} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {!hasBudgets ? (
            <Card>
              <CardHeader
                title={`Nenhum limite definido em ${monthLabel(ref)}`}
                subtitle="Comece por um dos dois caminhos — depois é só ajustar o que não fizer sentido."
              />
              <BudgetStarters
                monthRef={ref}
                canCopyPrevious={overview.previousMonthHasBudgets}
              />
              <div className="mt-5">
                <Hint tone="tip" title="Por onde começar">
                  Orçamento que ignora o histórico não se sustenta. Comece pela sua média real dos
                  últimos meses e só então aperte onde você quer mudar de comportamento — normalmente
                  delivery, lazer e compras.
                </Hint>
              </div>
            </Card>
          ) : null}

          <Card className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-[0.9375rem] font-semibold tracking-tight">
                  Limites de {monthLabel(ref)}
                </h2>
                <p className="muted mt-0.5 text-[0.8125rem]">
                  Clique no valor para editar. Zerar o campo remove o limite.
                </p>
              </div>
              {hasBudgets ? (
                <BudgetStarters
                  monthRef={ref}
                  canCopyPrevious={overview.previousMonthHasBudgets}
                  compact
                />
              ) : null}
            </div>

            <BudgetList rows={overview.rows} monthRef={ref} />
          </Card>

          {overview.uncategorizedSpentCents > 0 ? (
            <Hint tone="warn">
              <strong>{formatCents(overview.uncategorizedSpentCents)}</strong> em lançamentos sem
              categoria neste mês. Enquanto ficarem assim, esse gasto não entra em nenhum limite —{" "}
              <Link href="/lancamentos" className="font-semibold underline">
                classifique na tela de lançamentos
              </Link>
              .
            </Hint>
          ) : null}

          {semLimite.length ? (
            <Hint tone="info">
              {semLimite.length} categoria(s) gastaram neste mês sem limite definido, somando{" "}
              <strong>{formatCents(overview.unbudgetedSpentCents)}</strong>. Defina um teto para elas
              e o orçamento passa a cobrir o mês inteiro.
            </Hint>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader
              title="Resumo do mês"
              subtitle="Considera só o gasto das categorias que têm limite."
            />

            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="tnum text-2xl font-semibold tracking-tight">
                {formatCents(overview.budgetedSpentCents)}
              </span>
              <span className="muted tnum text-[0.8125rem]">
                de {formatCents(overview.totalLimitCents)} orçados
              </span>
            </div>
            <Progress
              label="Quanto do orçamento do mês já foi consumido"
              value={usoDoOrcamento}
              color={
                usoDoOrcamento > 100
                  ? "var(--color-money-out)"
                  : usoDoOrcamento >= 80
                    ? "var(--color-variable)"
                    : "var(--color-money-in)"
              }
              height={10}
            />

            <ul className="mt-5 space-y-3 text-[0.8125rem]">
              <Line label="Estouraram o limite" value={String(estourou.length)} tone={estourou.length ? "bad" : "good"} />
              <Line label="Perto do limite" value={String(atencao.length)} tone={atencao.length ? "warn" : "good"} />
              <Line
                label="Gastaram sem limite"
                value={String(semLimite.length)}
                tone={semLimite.length ? "warn" : "good"}
              />
              <Line
                label="Comprometido da renda"
                value={income ? `${pct(overview.totalLimitCents, income)}%` : "—"}
              />
              <Line
                label={sobraOrcada >= 0 ? "Sobraria no orçamento" : "Orçamento acima da renda"}
                value={formatCents(Math.abs(sobraOrcada))}
                tone={sobraOrcada >= 0 ? "good" : "bad"}
              />
            </ul>
          </Card>

          {overview.totalLimitCents > 0 && income > 0 ? (
            <Hint tone={sobraOrcada >= 0 ? "good" : "warn"}>
              {sobraOrcada >= 0 ? (
                <>
                  Seus limites somam <strong>{pct(overview.totalLimitCents, income)}%</strong> da
                  renda. O que sobrar do orçamento é o que vai para a reserva e para as metas.
                </>
              ) : (
                <>
                  A soma dos limites passa da sua renda em{" "}
                  <strong>{formatCents(Math.abs(sobraOrcada))}</strong>. Mesmo cumprindo tudo à risca
                  o mês fecharia no vermelho — vale rever os tetos maiores.
                </>
              )}
            </Hint>
          ) : null}

          <Card>
            <CardHeader
              title="Como o alerta funciona"
              subtitle="Três estados, para você agir antes do estouro."
            />
            <ul className="space-y-2.5 text-[0.8125rem]">
              <Legend color="var(--color-money-in)" label="Até 79% do limite" desc="No ritmo" />
              <Legend color="var(--color-variable)" label="De 80% a 100%" desc="Pise no freio" />
              <Legend color="var(--color-money-out)" label="Acima de 100%" desc="Estourou" />
            </ul>
            <p className="muted mt-4 text-xs leading-relaxed">
              A projeção ao lado de cada categoria estima o fechamento do mês mantendo o ritmo atual
              de gasto. Serve para perceber o estouro no dia 10, não no dia 30.
            </p>
            <div className="mt-4">
              <Link
                href="/lancamentos"
                className="text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                Ver os lançamentos do mês →
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "bad"
      ? "text-[var(--text-out)]"
      : tone === "warn"
        ? "text-[var(--text-warn)]"
        : tone === "good"
          ? "text-[var(--text-in)]"
          : "";
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="muted">{label}</span>
      <span className={`tnum font-semibold ${color}`}>{value}</span>
    </li>
  );
}

function Legend({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="font-medium">{label}</span>
      <span className="muted ml-auto text-xs">{desc}</span>
    </li>
  );
}
