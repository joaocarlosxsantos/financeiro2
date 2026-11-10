"use client";

import { ArrowLeftRight } from "lucide-react";
import type { PreviewRow } from "@/server/actions/import";
import { Field, Select } from "@/components/ui/field";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE" };

export function ImportReview({ rows, categories, onToggle, onCategory, onTransfer }: {
  rows: PreviewRow[]; categories: Category[];
  onToggle: (index: number) => void;
  onCategory: (index: number, value: string) => void;
  onTransfer: (index: number) => void;
}) {
  return <>
    <ul className="space-y-3 md:hidden" aria-label="Conferência de lançamentos">
      {rows.map((row, i) => <li key={`${row.fingerprint}-${i}`} className="min-w-0 rounded-xl border bg-[var(--surface)] p-3">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={!row.duplicate} onChange={() => onToggle(i)} aria-label={`Importar ${row.description}`} className="size-5 accent-[var(--acento)]" />
            {row.duplicate ? "Ignorar linha" : "Importar linha"}
          </label>
          <span className={cn("tnum pt-3 text-sm font-medium", row.kind === "INCOME" ? "text-[var(--text-in)]" : "text-[var(--text-out)]")}>{row.kind === "INCOME" ? "+" : "−"} {formatCents(row.amountCents)}</span>
        </div>
        <p className="mb-1 break-words text-sm font-medium">{row.description}</p>
        <p className="tnum mb-3 text-xs text-[var(--text-muted)]">{formatDate(row.date)}</p>
        {row.dateAdjusted && <p className="mb-2 text-xs text-[var(--text-warn)]">Compra realizada em {formatDate(row.originalDate!)}</p>}
        {row.possibleDuplicate && <p className="mb-2 text-xs text-[var(--text-warn)]">Possível duplicata</p>}
        {row.installmentNumber && row.installmentTotal && <p className="mb-2 text-xs">Parcela {row.installmentNumber}/{row.installmentTotal}</p>}
        <Field label="Categoria">
          <Select className="min-h-12 text-base!" disabled={row.isTransfer} value={row.categoryId ?? ""} onChange={(e) => onCategory(i, e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.filter((category) => category.kind === row.kind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </Field>
        <button type="button" aria-pressed={row.isTransfer} onClick={() => onTransfer(i)} className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border bg-[var(--surface-2)] px-3 text-sm">
          <ArrowLeftRight aria-hidden="true" className="size-5" />{row.isTransfer ? "Transferência marcada" : "Marcar transferência"}
        </button>
      </li>)}
    </ul>
          <div className="hidden min-w-0 max-w-full overflow-x-auto md:block">
            <table className="w-full text-[0.8125rem]">
              <thead>
                <tr className="muted border-b text-left text-xs">
                  <th className="px-5 py-2 font-medium">Importar</th>
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Descrição</th>
                  <th className="py-2 font-medium">Categoria</th>
                  <th className="py-2 text-center font-medium">Transferência</th>
                  <th className="px-5 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <tr key={`${row.fingerprint}-${i}`} className={cn(row.duplicate && "bg-[var(--surface-2)]")}>
                    <td className="px-5 py-2.5">
                      <input
                        type="checkbox"
                        checked={!row.duplicate}
                        onChange={() => onToggle(i)}
                        aria-label={`Importar ${row.description}`}
                        className="min-h-11 min-w-11 size-11 accent-[var(--color-brand-600)]"
                      />
                    </td>
                    <td className="tnum py-2.5 whitespace-nowrap">
                      {formatDate(row.date)}
                      {row.dateAdjusted ? (
                        <span
                          className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[var(--text-warn)]"
                          title={`Compra realizada em ${formatDate(row.originalDate!)} — gravada na fatura do mês escolhido`}
                        >
                          compra realizada em {formatDate(row.originalDate!)}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-64 py-2.5">
                      <span className="block truncate">{row.description}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {row.possibleDuplicate ? (
                          <span className="inline-block rounded-md bg-[var(--color-warn-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--text-warn)]">
                            possível duplicata
                          </span>
                        ) : null}
                        {row.installmentNumber && row.installmentTotal ? (
                          <span className="inline-block rounded-md bg-[var(--color-save-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--text-brand)]">
                            parcela {row.installmentNumber}/{row.installmentTotal}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <select aria-label={`Categoria de ${row.description}`}
                        disabled={row.isTransfer}
                        value={row.categoryId ?? ""}
                        onChange={(e) => onCategory(i, e.target.value)}
                        className="min-h-12 min-w-0 max-w-full text-base! cursor-pointer rounded-md border bg-[var(--surface-2)] px-1.5 py-1 text-xs disabled:opacity-50"
                      >
                        <option value="">Sem categoria</option>
                        {categories
                          .filter((c) => c.kind === row.kind)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => onTransfer(i)}
                        title={
                          row.isTransfer
                            ? "É transferência (pagamento de fatura, entre contas suas etc.) — fora dos relatórios de receita/despesa, mas conta no saldo. Clique para desmarcar."
                            : "Marcar como transferência entre contas suas (ex.: pagamento de fatura) — fora dos relatórios, mas conta no saldo"
                        }
                        aria-pressed={row.isTransfer}
                        aria-label={`Marcar ${row.description} como transferência`}
                        className={["inline-flex items-center justify-center",["min-h-11 min-w-11", cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
                          row.isTransfer
                            ? "bg-[var(--color-save-soft)] text-[var(--text-brand)]"
                            : "muted hover:bg-[var(--surface-2)]",
                        )].filter(Boolean).join(" ")].filter(Boolean).join(" ")}
                      >
                        <ArrowLeftRight className="size-3.5" />
                      </button>
                    </td>
                    <td
                      className={cn(
                        "tnum px-5 py-2.5 text-right font-medium whitespace-nowrap",
                        row.kind === "INCOME"
                          ? "text-[var(--text-in)]"
                          : "text-[var(--text-out)]",
                      )}
                    >
                      {row.kind === "INCOME" ? "+" : "−"} {formatCents(row.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
  </>;
}
