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

/**
 * Entrou x saiu por mês, com a linha do que sobrou.
 * Um só eixo — as três séries são reais em BRL.
 */
export function MonthlyFlowChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2}>
          <CartesianGrid stroke={VIZ.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "currentColor", opacity: 0.65 }}
          />
          <YAxis
            tickFormatter={(v) => formatAxisCents(Number(v))}
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(127,140,160,0.08)" }} />
          <Legend
            verticalAlign="top"
            align="left"
            height={32}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, opacity: 0.85 }}
          />
          <Bar dataKey="entrou" name="Entrou" fill={VIZ.in} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="saiu" name="Saiu" fill={VIZ.out} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line
            type="monotone"
            dataKey="sobrou"
            name="Sobrou"
            stroke={VIZ.balance}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: VIZ.balance }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras empilhadas de fixo x variável — mostra o quanto do gasto é compromisso. */
export function FixedVariableChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={VIZ.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "currentColor", opacity: 0.65 }}
          />
          <YAxis
            tickFormatter={(v) => formatAxisCents(Number(v))}
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(127,140,160,0.08)" }} />
          <Legend
            verticalAlign="top"
            align="left"
            height={32}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, opacity: 0.85 }}
          />
          <Bar dataKey="fixo" stackId="g" name="Gasto fixo" fill={VIZ.fixed} maxBarSize={30} />
          <Bar
            dataKey="variavel"
            stackId="g"
            name="Gasto variável"
            fill={VIZ.variable}
            radius={[4, 4, 0, 0]}
            maxBarSize={30}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
