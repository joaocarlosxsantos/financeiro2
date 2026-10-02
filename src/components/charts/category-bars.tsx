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
          color: "var(--text-muted)",
          nature: "VARIABLE" as const,
          totalCents: restTotal,
        },
      ]
    : top;

  const max = Math.max(...rows.map((r) => r.totalCents), 1);

  return (
    <ol className="space-y-3" role="list">
      {rows.map((row, idx) => (
        <li key={row.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="tnum font-mono text-xs text-[var(--text-muted)] w-4 shrink-0 text-right select-none">
                {idx + 1}.
              </span>
              <span className="truncate font-medium text-[var(--text)]">{row.name}</span>
              <span
                className={
                  row.nature === "FIXED"
                    ? "shrink-0 rounded-sm bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider text-[var(--text-muted)] ring-1 ring-[var(--line)]"
                    : "hidden"
                }
              >
                fixo
              </span>
            </span>
            <span className="flex items-baseline gap-2 shrink-0">
              <span className="tnum font-mono font-semibold text-[var(--text)]">
                {formatCents(row.totalCents)}
              </span>
              <span className="tnum font-mono text-[0.6875rem] text-[var(--text-muted)] w-9 text-right">
                {pct(row.totalCents, total)}%
              </span>
            </span>
          </div>
          <div className="h-[2px] w-full overflow-hidden bg-[var(--surface-2)]">
            <div
              className="h-full motion-reduce:transition-none transition-[width] duration-300"
              style={{ width: `${(row.totalCents / max) * 100}%`, background: row.color }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
