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
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-xs">
      {label ? (
        <p className="mb-1.5 border-b border-[var(--line)] pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono">
          {label}
        </p>
      ) : null}
      <ul className="space-y-1 text-xs">
        {payload.map((item, i) => {
          const chipColor = item.color?.startsWith("url") ? "var(--text-brand)" : item.color;
          return (
            <li key={i} className="flex items-center gap-2">
              {chipColor ? (
                <span className="size-2 shrink-0" style={{ background: chipColor }} />
              ) : null}
              <span className="text-[var(--text-muted)]">{item.name}</span>
              <span className="tnum font-mono ml-auto font-medium text-[var(--text)] pl-3">
                {formatCents(Number(item.value ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
