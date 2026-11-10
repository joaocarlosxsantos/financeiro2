"use client";

import Link from "next/link";

export type BillsTabType = "contas" | "compartilhadas";

export function BillsTabs({
  activeTab,
  monthParam,
  individualCount,
  sharedCount,
}: {
  activeTab: BillsTabType;
  monthParam?: string;
  individualCount: number;
  sharedCount: number;
}) {
  function getTabHref(tab: BillsTabType) {
    const params = new URLSearchParams();
    if (monthParam) params.set("m", monthParam);
    params.set("aba", tab);
    return `/contas-a-pagar?${params.toString()}`;
  }

  return (
    <div
      role="tablist"
      aria-label="Visualização de contas a pagar"
      className="grid w-full grid-cols-2 gap-1 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-2)] p-1"
    >
      <Link
        id="tab-contas"
        aria-controls="tabpanel-contas"
        href={getTabHref("contas")}
        role="tab"
        aria-selected={activeTab === "contas"}
        className={["inline-flex min-h-11 items-center",`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-button)] px-3 text-sm transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--acento)] ${
          activeTab === "contas"
            ? "bg-[var(--surface-3)] font-semibold text-[var(--text)]"
            : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
        }`].filter(Boolean).join(" ")}
      >
        <span>Contas</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-xs ${
            activeTab === "contas"
              ? "bg-[var(--surface-2)] text-[var(--text)] font-semibold"
              : "bg-[var(--border)] text-[var(--text-muted)]"
          }`}
        >
          {individualCount}
        </span>
      </Link>

      <Link
        id="tab-compartilhadas"
        aria-controls="tabpanel-compartilhadas"
        href={getTabHref("compartilhadas")}
        role="tab"
        aria-selected={activeTab === "compartilhadas"}
        className={["inline-flex min-h-11 items-center",`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-button)] px-3 text-sm transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--acento)] ${
          activeTab === "compartilhadas"
            ? "bg-[var(--surface-3)] font-semibold text-[var(--text)]"
            : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
        }`].filter(Boolean).join(" ")}
      >
        <span>Compartilhadas</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-xs ${
            activeTab === "compartilhadas"
              ? "bg-[var(--surface-2)] text-[var(--text)] font-semibold"
              : "bg-[var(--border)] text-[var(--text-muted)]"
          }`}
        >
          {sharedCount}
        </span>
      </Link>
    </div>
  );
}
