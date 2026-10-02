"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisCents } from "@/lib/money";
import { MoneyTooltip } from "./tooltip";
import { VIZ } from "./palette";

export type ProjectionRow = { label: string } & Record<string, number | string>;

export function ProjectionChart({
  data,
  series,
}: {
  data: ProjectionRow[];
  series: { key: string; name: string; color: string }[];
}) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--line)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={11}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          />
          <YAxis
            tickFormatter={(v) => formatAxisCents(Number(v))}
            tickLine={false}
            axisLine={false}
            width={76}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          />
          <Tooltip
            content={<MoneyTooltip />}
            cursor={{ stroke: "var(--line)", strokeWidth: 1 }}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={32}
            iconType="plainline"
            iconSize={12}
            itemSorter={() => 0}
            wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)", opacity: 0.85 }}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
