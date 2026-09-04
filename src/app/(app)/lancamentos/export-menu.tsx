"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import { monthRefFromParam, monthRefToParam } from "@/lib/dates";

/**
 * CSV e Excel levam os filtros ativos da tela (mês ou período, categoria,
 * tipo, busca...) — o que está na lista é o que sai no arquivo. O PDF é o
 * relatório do mês (não do filtro), então só leva o mês atual.
 */
export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const params = useSearchParams();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const dataParams = new URLSearchParams(params.toString());
  const csvHref = `/api/exportar/lancamentos?${dataParams.toString()}${dataParams.toString() ? "&" : ""}format=csv`;
  const xlsxHref = `/api/exportar/lancamentos?${dataParams.toString()}${dataParams.toString() ? "&" : ""}format=xlsx`;

  const ref = monthRefFromParam(params.get("m"));
  const pdfHref = `/api/exportar/relatorio?m=${monthRefToParam(ref)}`;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border bg-[var(--surface)] px-3 text-[0.8125rem] font-medium hover:bg-[var(--surface-2)]"
      >
        <Download className="size-3.5" />
        Exportar
        <ChevronDown className="size-3.5" />
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-20 mt-2 w-64 rounded-xl border bg-[var(--surface)] p-1.5 shadow-lg">
          <a
            href={csvHref}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            <FileText className="muted size-4" />
            <span>
              CSV
              <span className="muted block text-[0.6875rem]">Lançamentos filtrados</span>
            </span>
          </a>
          <a
            href={xlsxHref}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            <FileSpreadsheet className="muted size-4" />
            <span>
              Excel (.xlsx)
              <span className="muted block text-[0.6875rem]">Lançamentos filtrados</span>
            </span>
          </a>
          <a
            href={pdfHref}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            <FileText className="muted size-4" />
            <span>
              Relatório em PDF
              <span className="muted block text-[0.6875rem]">Resumo do mês, não do filtro</span>
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
