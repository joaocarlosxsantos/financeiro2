import { TrendingDown } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getDebtOverview, getMonthSummary, getUser } from "@/server/queries";
import { currentMonthRef } from "@/lib/dates";
import { formatCents, pct } from "@/lib/money";
import { balanceCents } from "@/lib/finance";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { EmptyState } from "@/components/ui/empty";
import { DebtList } from "./debt-list";
import { DebtComposer } from "./debt-composer";
import { PayoffPlanner } from "./payoff-planner";

export const metadata = { title: "Dívidas — Financeiro 2.0" };

export default async function DebtsPage() {
  const userId = await requireUserId();
  const ref = currentMonthRef();

  const [user, overview, summary] = await Promise.all([
    getUser(userId),
    getDebtOverview(userId),
    getMonthSummary(userId, ref),
  ]);

  const income = user.monthlyIncomeCents;
  const sobra = Math.max(0, balanceCents(summary));
  const extraSugerido = Math.max(0, sobra - overview.totalMinimumCents);
  const comprometido = income ? pct(overview.totalMinimumCents, income) : 0;
  const jurosSobreRenda = income ? pct(overview.totalMonthlyInterestCents, income) : 0;

  return (
    <>
      <PageHeader
        title="Dívidas"
        description="Sair da dívida é um problema de ordem, não de força de vontade. Aqui você vê quanto os juros custam por mês e qual sequência de quitação sai mais barato."
      />

      {!overview.debts.length ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card className="p-0">
            <EmptyState
              icon={TrendingDown}
              title="Nenhuma dívida cadastrada"
              description="Se você não tem dívida, ótimo — pule esta tela. Se tem, cadastrar é o passo que transforma um problema difuso em um plano com data para acabar."
            />
          </Card>
          <Card>
            <CardHeader title="Cadastrar dívida" subtitle="Comece pela de maior juros." />
            <DebtComposer />
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="O tamanho do buraco"
                subtitle="O primeiro passo é enxergar o número real."
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Saldo devedor"
                  value={formatCents(overview.totalBalanceCents)}
                  tone="bad"
                />
                <Metric
                  label="Juros por mês"
                  value={formatCents(overview.totalMonthlyInterestCents)}
                  hint={income ? `${jurosSobreRenda}% da sua renda` : undefined}
                  tone="bad"
                />
                <Metric
                  label="Mínimos por mês"
                  value={formatCents(overview.totalMinimumCents)}
                  hint={income ? `${comprometido}% da sua renda` : undefined}
                />
              </div>

              <div className="mt-4">
                <Hint tone={overview.totalMonthlyInterestCents > 0 ? "warn" : "info"}>
                  {overview.totalMonthlyInterestCents > 0 ? (
                    <>
                      Só de juros, essas dívidas custam{" "}
                      <strong>{formatCents(overview.totalMonthlyInterestCents)} por mês</strong> —
                      esse é o valor que some da sua vida sem comprar nada. Pagar só o mínimo
                      significa que boa parte disso se repete no mês seguinte.
                    </>
                  ) : (
                    <>
                      Nenhuma dessas dívidas está cobrando juros. Se alguma cobra, informe a taxa
                      para o plano ficar realista.
                    </>
                  )}
                </Hint>
              </div>
            </Card>

            <Card className="p-0">
              <div className="border-b px-5 py-4">
                <h2 className="text-[0.9375rem] font-semibold tracking-tight">Suas dívidas</h2>
                <p className="muted mt-0.5 text-[0.8125rem]">
                  Da que cobra mais juros para a que cobra menos. Clique nos valores para editar.
                </p>
              </div>
              <DebtList debts={overview.debts} />
            </Card>

            <PayoffPlanner
              debts={overview.debts.map((d) => ({
                id: d.id,
                name: d.name,
                balanceCents: d.balanceCents,
                monthlyRateBps: d.monthlyRateBps,
                minimumPaymentCents: d.minimumPaymentCents,
              }))}
              suggestedExtraCents={extraSugerido}
              totalMinimumCents={overview.totalMinimumCents}
            />
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader title="Cadastrar dívida" />
              <DebtComposer />
            </Card>

            <Hint tone="tip" title="A ordem que funciona">
              Antes de investir, quite o que cobra juros alto — nenhum investimento seguro paga
              13% ao mês. A exceção é uma reserva mínima de um mês de custo de vida: sem ela,
              qualquer imprevisto vira dívida nova e o esforço recomeça do zero.
            </Hint>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="muted text-xs">{label}</p>
      <p
        className="tnum mt-1 text-xl font-semibold tracking-tight"
        style={tone === "bad" ? { color: "var(--text-out)" } : undefined}
      >
        {value}
      </p>
      {hint ? <p className="muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}
