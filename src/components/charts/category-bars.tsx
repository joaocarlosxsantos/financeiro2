import { formatCents, pct } from "@/lib/money";
import type { CategorySlice } from "@/server/queries";
import { CHART_CATEGORY_PALETTE } from "./palette";

/** Ranked, directly labelled bars: names and ranks carry meaning without color. */
export function CategoryBars({ slices, limit = 5, loading = false }: { slices: CategorySlice[]; limit?: number; loading?: boolean }) {
  if (loading || !slices.some((row) => row.totalCents > 0)) {
    return <p role="status" aria-busy={loading} className="flex h-56 items-center justify-center px-4 text-center text-sm text-[var(--text-muted)]">{loading ? "Carregando categorias…" : "Sem despesas no período"}</p>;
  }
  const sorted = slices.filter((row) => row.totalCents > 0).toSorted((a, b) => b.totalCents - a.totalCents);
  const total = sorted.reduce((sum, row) => sum + row.totalCents, 0);
  const count = Math.max(1, Math.min(5, Math.floor(limit) || 5));
  const rows = sorted.slice(0, count);
  const rest = sorted.slice(count);
  if (rest.length) rows.push({ id: "chart-others", name: `Outras ${rest.length} categorias`, color: "", nature: "VARIABLE", totalCents: rest.reduce((sum, row) => sum + row.totalCents, 0) });
  const max = Math.max(...rows.map((row) => row.totalCents));

  return (
    <figure className="min-w-0 w-full" aria-label={`Despesas por categoria: ${formatCents(total)} no total.`}>
      <ol className="space-y-4" role="list">
        {rows.map((row, index) => (
          <li key={row.id}>
            <div className="mb-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
              <span className="min-w-0 break-words font-medium">
                <span className="tnum mr-2 text-[var(--text-muted)]">{index + 1}.</span>
                {row.name}{row.nature === "FIXED" ? " · fixo" : ""}
              </span>
              <span className="tnum flex flex-wrap gap-x-3 gap-y-1">
                <span className="font-medium">{formatCents(row.totalCents)}</span>
                <span className="text-[var(--text-muted)]">{pct(row.totalCents, total)}%</span>
              </span>
            </div>
            <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-sm bg-[var(--surface-2)]">
              <div className="h-full rounded-sm" style={{ width: `${(row.totalCents / max) * 100}%`, background: CHART_CATEGORY_PALETTE[index] }} />
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
