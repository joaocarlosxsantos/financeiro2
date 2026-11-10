"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type PointerEvent } from "react";
import { chartMoney } from "./chart-utils";
import { MoneyTooltip } from "./tooltip";

export type ChartRow = { label: string } & Record<string, number | string>;
export type ChartSeries = { key: string; name: string; color: string; dash?: string };
const subscribe = () => () => {};

/** A long press inspects the nearest month; ordinary touch scrolling stays free. */
export function useChartTouch(length: number, band = false) {
  const [active, setActive] = useState<boolean | undefined>(undefined);
  const [selection, setSelection] = useState<{ index: number; x: number; top: number; height: number }>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function endTouch(event: PointerEvent) {
    clearTimeout(timer.current);
    setActive(event.pointerType === "touch" ? false : undefined);
  }
  function selectPoint(event: PointerEvent) {
    const plot = event.currentTarget.querySelector(".recharts-cartesian-grid")?.getBoundingClientRect();
    if (!plot?.width || !length) return;
    const container = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - plot.left) / plot.width));
    const index = Math.min(length - 1, band ? Math.floor(ratio * length) : Math.round(ratio * (length - 1)));
    const point = band ? (index + 0.5) / length : index / Math.max(1, length - 1);
    setSelection({ index, x: plot.left - container.left + point * plot.width, top: plot.top - container.top, height: plot.height });
  }
  return {
    active,
    selection,
    handlers: {
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType !== "touch") return;
        selectPoint(event);
        setActive(false);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setActive(true), 320);
      },
      onPointerUp: endTouch,
      onPointerCancel: endTouch,
      onPointerLeave: endTouch,
      onPointerMove: (event: PointerEvent) => {
        if (event.pointerType === "mouse") setActive(undefined);
        else if (active) selectPoint(event);
      },
      onKeyDown: () => setActive(undefined),
    },
  };
}

export function ChartFrame({ title, data, series, empty, loading = false, children, interaction }: {
  title: string;
  data: ChartRow[];
  series: ChartSeries[];
  empty: boolean;
  loading?: boolean;
  children: ReactNode;
  interaction?: ReturnType<typeof useChartTouch>;
}) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const last = data.at(-1);
  const summary = last
    ? `${last.label}: ${series.map((item) => `${item.name} ${chartMoney(Number(last[item.key] ?? 0))}`).join("; ")}.`
    : "Sem dados no período.";
  const busy = loading || !hydrated;
  const selected = interaction?.selection && data[interaction.selection.index];

  return (
    <figure className="min-w-0 w-full max-w-full">
      {!busy && !empty && last && (
        <figcaption className="sr-only sm:not-sr-only sm:mb-3 text-xs text-[var(--text-muted)]">
          <p className="mb-2 hidden sm:block">{last.label} · valores em reais</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {series.map((item, index) => (
              <li key={item.key} className="min-w-0 max-w-full">
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden="true" width="20" height="8"><path d="M0 4H20" stroke={item.color} strokeWidth={1.75} strokeDasharray={item.dash ?? (index ? "4 4" : undefined)} /></svg>
                  {item.name}
                </span>{" "}
                <span className="tnum sr-only text-[var(--text)] sm:not-sr-only sm:inline-block">{chartMoney(Number(last[item.key] ?? 0))}</span>
              </li>
            ))}
          </ul>
        </figcaption>
      )}
      <div role="img" aria-label={`${title}. ${busy ? "Carregando gráfico." : empty ? "Sem dados no período." : summary}`} aria-busy={busy}
        className="relative h-40 [@media(max-height:700px)]:h-36 min-w-0 w-full max-w-full overflow-hidden focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--acento)] md:h-72" {...interaction?.handlers}>
        {busy || empty ? (
          <p role="status" className="flex h-full items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-center text-sm text-[var(--text-muted)]">
            {busy ? "Carregando gráfico…" : "Sem dados no período"}
          </p>
        ) : children}
        {!busy && !empty && interaction?.active && selected && <>
          <div aria-hidden="true" className="pointer-events-none absolute border-l border-[var(--text-subtle)]"
            style={{ left: interaction.selection?.x, top: interaction.selection?.top, height: interaction.selection?.height }} />
          <div className="pointer-events-none absolute top-0 left-0 max-w-full" data-chart-inspection>
            <MoneyTooltip active label={selected.label} payload={series.map((item) => ({ name: item.name, dataKey: item.key, value: Number(selected[item.key] ?? 0) }))} />
          </div>
        </>}
      </div>
      {!busy && !empty && (
        <details className="text-xs sm:mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-[var(--text-muted)]">Ver valores do gráfico</summary>
          <dl className="max-h-64 space-y-3 overflow-y-auto rounded-xl border bg-[var(--surface)] p-3">
            {data.map((row, index) => <div key={index}>
              <dt className="mb-1 font-medium">{row.label || `Período ${index + 1}`}</dt>
              {series.map((item) => <dd key={item.key} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <span>{item.name}</span><span className="tnum">{chartMoney(Number(row[item.key] ?? 0))}</span>
              </dd>)}
            </div>)}
          </dl>
        </details>
      )}
    </figure>
  );
}
