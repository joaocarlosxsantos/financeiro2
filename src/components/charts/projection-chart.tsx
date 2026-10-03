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
import {
  isProjectionDataEmpty,
  getZeroSafeDomain,
  getZeroSafeTicks,
} from "./chart-utils";

export type ProjectionRow = { label: string } & Record<string, number | string>;

export function ProjectionChart({
  data,
  series,
}: {
  data: ProjectionRow[];
  series: { key: string; name: string; color: string }[];
}) {
  const allZero = isProjectionDataEmpty(
    data,
    series.map((s) => s.key),
  );

  return (
    <div className="relative h-80 w-full">
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
            domain={getZeroSafeDomain(allZero)}
            ticks={getZeroSafeTicks(allZero)}
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
