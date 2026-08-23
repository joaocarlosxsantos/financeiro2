"use client";

import { formatCents } from "@/lib/money";

type Item = { name?: string; value?: number; color?: string; dataKey?: string | number };

export function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Item[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border bg-[var(--surface)] px-3 py-2.5 shadow-lg">
      {label ? <p className="mb-1.5 text-xs font-semibold capitalize">{label}</p> : null}
      <ul className="space-y-1">
        {payload.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-[0.8125rem]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.color }} />
            <span className="muted">{item.name}</span>
            <span className="tnum ml-auto font-medium">{formatCents(Number(item.value ?? 0))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
