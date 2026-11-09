"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAxisCents } from "@/lib/money";
import { MoneyTooltip } from "./tooltip";
import { ChartFrame, useChartTouch, type ChartRow, type ChartSeries } from "./chart-frame";
import { VIZ } from "./palette";
import { getMoneyScale, isProjectionDataEmpty } from "./chart-utils";

export type ProjectionRow = ChartRow;

export function ProjectionChart({ data, series, title = "Projeção de patrimônio por cenário", area = true, loading = false }: {
  data: ProjectionRow[];
  series: ChartSeries[];
  title?: string;
  area?: boolean;
  loading?: boolean;
}) {
  const id = `projection-${useId()}`;
  const touch = useChartTouch(data.length);
  const inks = series.map((item, index) => ({ ...item, dash: item.dash ?? [undefined, "4 4", "1 4"][index % 3] }));
  const empty = isProjectionDataEmpty(data, series.map((item) => item.key));
  const scale = getMoneyScale(data.flatMap((row) => series.map((item) => Number(row[item.key] ?? 0))));
  const tickLabels = [...new Set(Array.from({ length: Math.min(5, data.length) }, (_, index) =>
    data[Math.round(index * (data.length - 1) / Math.max(1, Math.min(5, data.length) - 1))].label))];
  const tick = { fontSize: 12, fill: VIZ.axis, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

  return (
    <ChartFrame title={title} data={data} series={inks} empty={empty} loading={loading} interaction={touch}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            {inks.map((item, index) => (
              <linearGradient key={item.key} id={`${id}-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity={0.14} />
                <stop offset="100%" stopColor={item.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={VIZ.grid} strokeWidth={1} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} ticks={tickLabels} interval="preserveStartEnd" minTickGap={8} tick={tick} />
          <YAxis domain={scale.domain} ticks={scale.ticks} tickFormatter={(value) => formatAxisCents(Number(value)).replace("-", "−")} tickLine={false} axisLine={false} width={76} tick={tick} />
          <Tooltip active={touch.active === undefined ? undefined : false} position={{ x: 0, y: 0 }} content={<MoneyTooltip />} isAnimationActive={false} wrapperStyle={{ maxWidth: "100%" }} cursor={{ stroke: VIZ.axis, strokeWidth: 1 }} />
          {inks.map((item, index) => (
            <Area key={item.key} type="monotone" dataKey={item.key} name={item.name}
              stroke={item.color} strokeWidth={1.75} strokeLinecap="round" strokeDasharray={item.dash}
              fill={area ? `url(#${id}-${index})` : "none"} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
