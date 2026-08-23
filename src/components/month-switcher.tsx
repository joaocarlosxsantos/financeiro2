"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel, monthRefToParam, shiftMonth, type MonthRef } from "@/lib/dates";

export function MonthSwitcher({ value: current }: { value: MonthRef }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(delta: number) {
    const next = shiftMonth(current, delta);
    const sp = new URLSearchParams(params.toString());
    sp.set("m", monthRefToParam(next));
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border bg-[var(--surface)] p-1">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Mês anterior"
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 px-2 text-center text-[0.8125rem] font-medium first-letter:uppercase">
        {monthLabel(current)}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Próximo mês"
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
