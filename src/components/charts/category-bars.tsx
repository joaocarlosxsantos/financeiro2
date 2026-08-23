import { formatCents, pct } from "@/lib/money";
import type { CategorySlice } from "@/server/queries";

/**
 * Ranking de gastos por categoria.
 * Barras horizontais com nome e valor rotulados — a identidade vem do texto,
 * a cor é só apoio (nunca a única forma de distinguir).
 */
export function CategoryBars({ slices, limit = 8 }: { slices: CategorySlice[]; limit?: number }) {
  const total = slices.reduce((acc, s) => acc + s.totalCents, 0);
  const top = slices.slice(0, limit);
  const rest = slices.slice(limit);
  const restTotal = rest.reduce((acc, s) => acc + s.totalCents, 0);

  const rows = restTotal
    ? [
        ...top,
        {
          id: "outras",
          name: `Outras ${rest.length} categorias`,
          color: "#94a3b8",
          nature: "VARIABLE" as const,
          totalCents: restTotal,
        },
      ]
    : top;

  const max = Math.max(...rows.map((r) => r.totalCents), 1);

  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: row.color }} />
              <span className="truncate font-medium">{row.name}</span>
              <span
                className={
                  row.nature === "FIXED"
                    ? "shrink-0 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-[var(--border)] ring-inset"
                    : "hidden"
                }
              >
                fixo
              </span>
            </span>
            <span className="tnum shrink-0 font-semibold">{formatCents(row.totalCents)}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)] ring-inset">
              <div
                className="h-full rounded-full"
                style={{ width: `${(row.totalCents / max) * 100}%`, background: row.color }}
              />
            </div>
            <span className="tnum muted w-11 shrink-0 text-right text-xs">
              {pct(row.totalCents, total)}%
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
