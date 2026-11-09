"use client";

import { useId } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/server/queries";
import { formatAxisCents } from "@/lib/money";
import { MoneyTooltip } from "./tooltip";
import { VIZ } from "./palette";
import { ChartFrame, useChartTouch } from "./chart-frame";
import { getMoneyScale } from "./chart-utils";

const axisTick = { fontSize: 12, fill: VIZ.axis, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const flowSeries = [
  { key: "entrou", name: "Entrou", color: VIZ.in },
  { key: "saiu", name: "Saiu (listrado)", color: VIZ.out, dash: "2 2" },
  { key: "sobrou", name: "Sobrou (linha)", color: VIZ.balance },
];
const fixedSeries = [
  { key: "fixo", name: "Fixo (listrado)", color: VIZ.fixed, dash: "2 2" },
  { key: "variavel", name: "Variável", color: VIZ.variable },
];

export function MonthlyFlowChart({ data, loading = false }: { data: SeriesPoint[]; loading?: boolean }) {
  const id = `flow-${useId()}`;
  const touch = useChartTouch(data.length, true);
  const scale = getMoneyScale(data.flatMap((row) => [row.entrou, row.saiu, row.sobrou]));
  const empty = !data.some((row) => row.entrou || row.saiu || row.sobrou);
  return (
    <ChartFrame title="Entradas, saídas e saldo mensal" data={data} series={flowSeries} empty={empty} loading={loading} interaction={touch}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={6} barCategoryGap="30%" accessibilityLayer>
          <defs>
            <pattern id={id} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill={VIZ.out} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth={1.5} />
            </pattern>
          </defs>
          <CartesianGrid stroke={VIZ.grid} strokeWidth={1} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} tick={axisTick} />
          <YAxis domain={scale.domain} ticks={scale.ticks} tickFormatter={(value) => formatAxisCents(Number(value)).replace("-", "−")} tickLine={false} axisLine={false} width={76} tick={axisTick} />
          <Tooltip active={touch.active === undefined ? undefined : false} position={{ x: 0, y: 0 }} isAnimationActive={false} wrapperStyle={{ maxWidth: "100%" }} content={<MoneyTooltip />} cursor={{ stroke: VIZ.axis, strokeWidth: 1 }} />
          <Bar dataKey="entrou" name="Entrou" fill={VIZ.in} maxBarSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((row, index) => <Cell key={row.key} className={index === data.length - 1 ? "opacity-100" : "dark:opacity-55"} />)}
          </Bar>
          <Bar dataKey="saiu" name="Saiu" fill={`url(#${id})`} maxBarSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((row, index) => <Cell key={row.key} className={index === data.length - 1 ? "opacity-100" : "dark:opacity-55"} />)}
          </Bar>
          <Line type="monotone" dataKey="sobrou" name="Sobrou" stroke={VIZ.balance} strokeWidth={1.75} strokeLinecap="round" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function FixedVariableChart({ data, loading = false }: { data: SeriesPoint[]; loading?: boolean }) {
  const id = `fixed-${useId()}`;
  const touch = useChartTouch(data.length, true);
  const scale = getMoneyScale(data.map((row) => row.fixo + row.variavel));
  const empty = !data.some((row) => row.fixo || row.variavel);
  return (
    <ChartFrame title="Gastos fixos e variáveis por mês" data={data} series={fixedSeries} empty={empty} loading={loading} interaction={touch}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            <pattern id={id} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill={VIZ.fixed} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth={1.5} />
            </pattern>
          </defs>
          <CartesianGrid stroke={VIZ.grid} strokeWidth={1} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} tick={axisTick} />
          <YAxis domain={scale.domain} ticks={scale.ticks} tickFormatter={(value) => formatAxisCents(Number(value))} tickLine={false} axisLine={false} width={76} tick={axisTick} />
          <Tooltip active={touch.active === undefined ? undefined : false} position={{ x: 0, y: 0 }} isAnimationActive={false} wrapperStyle={{ maxWidth: "100%" }} content={<MoneyTooltip />} cursor={{ stroke: VIZ.axis, strokeWidth: 1 }} />
          <Bar dataKey="fixo" stackId="expenses" name="Gasto fixo" fill={`url(#${id})`} maxBarSize={12} isAnimationActive={false}>
            {data.map((row, index) => <Cell key={row.key} className={index === data.length - 1 ? "opacity-100" : "dark:opacity-55"} />)}
          </Bar>
          <Bar dataKey="variavel" stackId="expenses" name="Gasto variável" fill={VIZ.variable} maxBarSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((row, index) => <Cell key={row.key} className={index === data.length - 1 ? "opacity-100" : "dark:opacity-55"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
