"use client";

import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { monthLabel, monthRefToParam, shiftMonth, type MonthRef } from "@/lib/dates";
import { Button } from "@/components/ui/button";

/**
 * Substitui o MonthSwitcher só em Lançamentos: além de trocar de mês, deixa
 * escolher um período customizado (ou "todo o histórico" num clique) para
 * ver/buscar lançamentos além de um único mês.
 */
export function PeriodSwitcher({
  value: current,
  range,
}: {
  value: MonthRef;
  range: { from: string; to: string } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range?.from ?? "");
  const [to, setTo] = useState(range?.to ?? "");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function goMonth(delta: number) {
    const next = shiftMonth(current, delta);
    const sp = new URLSearchParams(params.toString());
    sp.set("m", monthRefToParam(next));
    sp.delete("from");
    sp.delete("to");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function applyRange(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("from", nextFrom);
    sp.set("to", nextTo);
    sp.delete("m");
    router.push(`${pathname}?${sp.toString()}`);
    setOpen(false);
  }

  function allHistory() {
    const nextFrom = "2000-01-01";
    const nextTo = new Date().toISOString().slice(0, 10);
    setFrom(nextFrom);
    setTo(nextTo);
    applyRange(nextFrom, nextTo);
  }

  function clearRange() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("from");
    sp.delete("to");
    router.push(`${pathname}?${sp.toString()}`);
  }

  if (range) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-xl border bg-[var(--surface)] px-3 py-1.5">
        <CalendarRange className="muted size-4 shrink-0" />
        <span className="text-[0.8125rem] font-medium tnum">
          {formatBr(range.from)} – {formatBr(range.to)}
        </span>
        <button
          type="button"
          onClick={clearRange}
          aria-label="Voltar para visão por mês"
          title="Voltar para visão por mês"
          className="muted inline-flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--surface-2)]"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={boxRef}>
      <div className="inline-flex items-center gap-1 rounded-xl border bg-[var(--surface)] p-1">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Mês anterior"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-36 px-2 text-center text-[0.8125rem] font-medium first-letter:uppercase">
          {monthLabel(current)}
        </span>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="Próximo mês"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Período customizado"
        title="Período customizado"
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-xl border bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      >
        <CalendarRange className="size-4" />
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border bg-[var(--surface)] p-3 shadow-lg">
          <p className="mb-2 text-[0.8125rem] font-semibold">Período customizado</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[0.75rem]">
              <span className="muted mb-1 block">De</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="input-base h-9 w-full py-0 text-[0.8125rem]"
              />
            </label>
            <label className="text-[0.75rem]">
              <span className="muted mb-1 block">Até</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input-base h-9 w-full py-0 text-[0.8125rem]"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={allHistory}
              className="cursor-pointer text-[0.75rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              Ver todo o histórico
            </button>
            <Button
              type="button"
              size="sm"
              disabled={!from || !to || from > to}
              onClick={() => applyRange(from, to)}
            >
              Aplicar
            </Button>
          </div>
          {from && to && from > to ? (
            <p className="mt-2 text-[0.75rem] text-rose-600 dark:text-rose-400">
              A data &quot;De&quot; precisa vir antes da &quot;Até&quot;.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
