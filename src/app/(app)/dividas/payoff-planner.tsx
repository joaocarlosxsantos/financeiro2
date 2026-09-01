"use client";

import { useMemo, useState } from "react";
import { Award, CalendarCheck } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Hint } from "@/components/ui/hint";
import { MoneyTooltip } from "@/components/charts/tooltip";
import { VIZ } from "@/components/charts/palette";
import { formatAxisCents, formatCents, parseMoneyToCents } from "@/lib/money";
import { compareStrategies, type DebtInput, type PayoffResult } from "@/lib/debts";
import { cn } from "@/lib/cn";

const AVALANCHE_COLOR = VIZ.in;
const SNOWBALL_COLOR = VIZ.balance;
/** Versões escurecidas das mesmas cores, para quando viram texto. */
const AVALANCHE_TEXT = "var(--text-in)";
const SNOWBALL_TEXT = "var(--text-brand)";

export function PayoffPlanner({
  debts,
  suggestedExtraCents,
  totalMinimumCents,
}: {
  debts: DebtInput[];
  suggestedExtraCents: number;
  totalMinimumCents: number;
}) {
  const [extra, setExtra] = useState((suggestedExtraCents / 100).toFixed(2).replace(".", ","));
  const extraCents = parseMoneyToCents(extra);

  const comparison = useMemo(() => compareStrategies(debts, extraCents), [debts, extraCents]);
  const { avalanche, snowball, interestSavedCents, monthsSaved } = comparison;

  const chartData = useMemo(() => {
    const max = Math.max(avalanche.timeline.length, snowball.timeline.length);
    return Array.from({ length: max }, (_, i) => ({
      label: i === 0 ? "hoje" : `${i}m`,
      avalanche: avalanche.timeline[i]?.balanceCents ?? 0,
      snowball: snowball.timeline[i]?.balanceCents ?? 0,
    }));
  }, [avalanche, snowball]);

  const impossible = avalanche.impossible ?? snowball.impossible;

  return (
    <Card>
      <CardHeader
        title="Plano de quitação"
        subtitle="Quanto você consegue pagar por mês além dos mínimos muda tudo. Mexa no valor e compare."
      />

      <div className="space-y-4">
        <Field
          label="Sobra por mês, além dos mínimos"
          hint={`Os mínimos já somam ${formatCents(totalMinimumCents)}.`}
          className="max-w-64"
        >
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" />
        </Field>

        {impossible ? (
          <Hint tone="warn" title="Assim a dívida nunca acaba">
            Com esse valor, o pagamento não cobre nem os juros do mês — faltam{" "}
            <strong>{formatCents(impossible.shortfallCents)}</strong> e o saldo cresce todo mês.
            Aqui o caminho não é apertar mais o orçamento: é <strong>renegociar a taxa</strong> ou
            trocar a dívida cara por uma mais barata (portabilidade, empréstimo com garantia).
          </Hint>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <StrategyCard
              title="Avalanche"
              subtitle="Ataca a dívida de maior juros"
              result={avalanche}
              color={AVALANCHE_COLOR}
              textColor={AVALANCHE_TEXT}
              winner
            />
            <StrategyCard
              title="Bola de neve"
              subtitle="Ataca a dívida de menor saldo"
              result={snowball}
              color={SNOWBALL_COLOR}
              textColor={SNOWBALL_TEXT}
            />
          </div>
        )}
      </div>

      {!impossible ? (
        <>
          <div className="mt-5 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.65 }}
                />
                <YAxis
                  tickFormatter={(v) => formatAxisCents(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  width={76}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                />
                <Tooltip content={<MoneyTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="left"
                  height={32}
                  iconType="circle"
                  iconSize={8}
                  itemSorter={() => 0}
                  wrapperStyle={{ fontSize: 12, opacity: 0.85 }}
                />
                <Line
                  type="monotone"
                  dataKey="avalanche"
                  name="Avalanche"
                  stroke={AVALANCHE_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="snowball"
                  name="Bola de neve"
                  stroke={SNOWBALL_COLOR}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <Hint tone={interestSavedCents > 0 ? "info" : "good"}>
              {interestSavedCents > 0 ? (
                <>
                  A avalanche economiza <strong>{formatCents(interestSavedCents)}</strong> de juros
                  {monthsSaved > 0 ? ` e termina ${monthsSaved} ${monthsSaved === 1 ? "mês" : "meses"} antes` : ""}.
                  Mas se você precisa ver uma dívida sumir para não desistir, a bola de neve custa
                  essa diferença e vale a pena — o plano que você abandona é o mais caro de todos.
                </>
              ) : (
                <>
                  Com essas dívidas, as duas estratégias dão praticamente no mesmo. Escolha a que
                  te motiva mais a continuar.
                </>
              )}
            </Hint>

            <div className="rounded-xl border p-4">
              <p className="text-[0.8125rem] font-medium">Quando cada dívida acaba</p>
              <p className="muted mb-2 text-xs">
                Seguindo a avalanche. Uma dívida pequena pode terminar antes só pelo mínimo dela.
              </p>
              <ol className="space-y-1.5">
                {avalanche.order.map((step, i) => (
                  <li key={step.debtId} className="flex items-baseline gap-2 text-[0.8125rem]">
                    <span className="muted tnum w-4 shrink-0">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{step.name}</span>
                    <span className="muted tnum shrink-0 text-xs">
                      mês {step.monthPaid}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function StrategyCard({
  title,
  subtitle,
  result,
  color,
  textColor,
  winner,
}: {
  title: string;
  subtitle: string;
  result: PayoffResult;
  color: string;
  textColor: string;
  winner?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border p-4")} style={{ borderColor: color }}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
        <p className="text-[0.875rem] font-semibold">{title}</p>
        {winner ? (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium"
            style={{
              color: textColor,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
            }}
          >
            <Award className="size-3" />
            mais barata
          </span>
        ) : null}
      </div>

      <p className="muted mb-3 text-xs">{subtitle}</p>

      <dl className="space-y-2 text-[0.8125rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="muted inline-flex items-center gap-1.5">
            <CalendarCheck className="size-3.5" />
            Livre em
          </dt>
          <dd className="tnum font-semibold">
            {result.months === null
              ? "—"
              : `${result.months} ${result.months === 1 ? "mês" : "meses"}`}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="muted">Juros que você paga</dt>
          <dd className="tnum font-semibold text-[var(--text-out)]">
            {formatCents(result.totalInterestCents)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="muted">Total desembolsado</dt>
          <dd className="tnum">{formatCents(result.totalPaidCents)}</dd>
        </div>
      </dl>
    </div>
  );
}
