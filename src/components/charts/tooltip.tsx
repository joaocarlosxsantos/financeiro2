"use client";

import { chartMoney } from "./chart-utils";

type Item = { name?: string; value?: number; color?: string; dataKey?: string | number };

export function MoneyTooltip({ active, payload, label }: {
  active?: boolean; payload?: Item[]; label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="max-w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text)]">
      {label !== undefined && label !== "" && <p className="mb-2 font-medium">{label}</p>}
      <ul className="space-y-1.5">
        {payload.map((item, index) => (
          <li key={item.dataKey ?? index} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span>{item.name}</span>
            <span className="tnum font-medium">{chartMoney(Number(item.value ?? 0))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
