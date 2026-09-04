"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteImportBatch } from "@/server/actions/import";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Batch = {
  id: string;
  fileName: string;
  rowCount: number;
  savedRows: number;
  createdAt: string;
  accountName: string;
};

/**
 * Desfazer uma importação errada. O caso comum: a fatura foi importada com a
 * data errada (um bug, ou a conta errada) — em vez de caçar lançamento por
 * lançamento em Lançamentos, apaga o lote inteiro de uma vez e importa de novo.
 */
export function ImportHistory({ batches }: { batches: Batch[] }) {
  const [items, setItems] = useState(batches);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const confirm = useConfirm();

  async function remove(batch: Batch) {
    const ok = await confirm({
      title: `Apagar a importação "${batch.fileName}"?`,
      description: `Os ${batch.savedRows} lançamento(s) que vieram dela serão excluídos. Isso não pode ser desfeito.`,
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    setPendingId(batch.id);
    start(async () => {
      const result = await deleteImportBatch(batch.id);
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.filter((b) => b.id !== batch.id));
    });
  }

  if (!items.length) return null;

  return (
    <div>
      {error ? <p className="mb-2 text-[0.8125rem] text-rose-600">{error}</p> : null}
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.id} className={cn("flex items-start gap-2 text-[0.8125rem]", pendingId === b.id && "opacity-50")}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.fileName}</p>
              <p className="muted text-xs">
                {b.savedRows} de {b.rowCount} linhas · {b.accountName} · {formatDate(b.createdAt)}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Apagar importação ${b.fileName}`}
              title="Apagar esta importação e os lançamentos que vieram dela"
              disabled={pendingId === b.id}
              onClick={() => remove(b)}
              className="muted mt-0.5 shrink-0 cursor-pointer rounded-lg p-2.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
