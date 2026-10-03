"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import type { SeriesPoint } from "@/server/queries";
import { formatAxisCents } from "@/lib/money";
import { MoneyTooltip } from "./tooltip";
import { VIZ } from "./palette";
import {
  isSeriesDataEmpty,
  getZeroSafeDomain,
  getZeroSafeTicks,
} from "./chart-utils";

interface LastPointLabelProps {
  x?: number;
  y?: number;
  value?: number | string;
  index?: number;
  dataLength?: number;
  allZero?: boolean;
}

function LastPointLabel({ x, y, value, index, dataLength, allZero }: LastPointLabelProps) {
  if (allZero || index !== (dataLength ?? 0) - 1 || x == null || y == null || value == null) {
    return null;
  }
  return (
    <text
      x={x + 6}
      y={y}
      fill="var(--text-brand)"
      fontSize={11}
      fontWeight={600}
      fontFamily="var(--font-mono), monospace"
      textAnchor="start"
      dominantBaseline="central"
    >
      Sobrou {formatAxisCents(Number(value))}
    </text>
  );
}

/**
 * Entrou x saiu por mês, com a linha do que sobrou.
 * Um só eixo — as três séries são reais em BRL.
 * Gramática "caderno de contas": barras sem raio, linha sem pontos,
 * rótulo direto no último ponto (sem legenda genérica).
 */
export function MonthlyFlowChart({ data }: { data: SeriesPoint[] }) {
  const allZero = isSeriesDataEmpty(data);

  return (
    <div className="relative h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 88, bottom: 0, left: -8 }}
          barGap={2}
        >
          <CartesianGrid stroke="var(--line)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          />
          <YAxis
            domain={getZeroSafeDomain(allZero)}
            ticks={getZeroSafeTicks(allZero)}
            tickFormatter={(v) => formatAxisCents(Number(v))}
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--line)", opacity: 0.15 }} />
          <Bar dataKey="entrou" name="Entrou" fill={VIZ.in} maxBarSize={26} />
          <Bar dataKey="saiu" name="Saiu" fill={VIZ.out} maxBarSize={26} />
          <Line
            type="monotone"
            dataKey="sobrou"
            name="Sobrou"
            stroke={VIZ.balance}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: VIZ.balance, stroke: "var(--surface)", strokeWidth: 2 }}
            label={(props: any) => (
              <LastPointLabel {...props} dataLength={data.length} allZero={allZero} />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {allZero ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] shadow-xs">
            Sem dados no período
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Barras empilhadas de fixo x variável — hachura fina para fixo e barras sem raio. */
export function FixedVariableChart({ data }: { data: SeriesPoint[] }) {
  const allZero = isSeriesDataEmpty(data);

  return (
    <div className="relative h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <pattern
              id="hatch-fixed"
              width="6"
              height="6"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill="var(--surface-2)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--text-brand)" strokeWidth={1.2} />
            </pattern>
          </defs>
          <CartesianGrid stroke="var(--line)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          />
          <YAxis
            domain={getZeroSafeDomain(allZero)}
            ticks={getZeroSafeTicks(allZero)}
            tickFormatter={(v) => formatAxisCents(Number(v))}
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--line)", opacity: 0.15 }} />
          <Legend
            verticalAlign="top"
            align="left"
            height={32}
            iconType="rect"
            iconSize={10}
            wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)", opacity: 0.85 }}
          />
          <Bar
            dataKey="fixo"
            stackId="g"
            name="Gasto fixo"
            fill="url(#hatch-fixed)"
            stroke="var(--text-brand)"
            strokeWidth={0.5}
            maxBarSize={30}
          />
          <Bar
            dataKey="variavel"
            stackId="g"
            name="Gasto variável"
            fill={VIZ.variable}
            maxBarSize={30}
          />
        </BarChart>
      </ResponsiveContainer>

      {allZero ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] shadow-xs">
            Sem dados no período
          </span>
        </div>
      ) : null}
    </div>
  );
}
