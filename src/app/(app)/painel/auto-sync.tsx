"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { autoSyncOpenFinance } from "@/server/actions/open-finance";

// Ao abrir/atualizar o painel, tenta sincronizar em background (o servidor aplica o gap de 5 min).
// Não bloqueia a leitura nem dispara refresh automático (evitando double-render).
export function AutoSync() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hasNewData, setHasNewData] = useState(false);

  useEffect(() => {
    let active = true;
    autoSyncOpenFinance()
      .then((result) => {
        if (!active) return;
        setError(result.error ?? null);
        if (result.synced) {
          setHasNewData(true);
        }
      })
      .catch(() => {
        if (active) {
          setError("A sincronização automática está indisponível. Você pode tentar novamente nas integrações.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (hasNewData) {
    return (
      <aside
        role="status"
        aria-live="polite"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text)]"
      >
        <span>Novos lançamentos sincronizados via Open Finance.</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setHasNewData(false);
            startTransition(() => {
              router.refresh();
            });
          }}
          className="inline-flex min-h-9 items-center rounded-lg bg-[var(--surface-3)] px-3 py-1.5 font-medium text-[var(--text)] hover:bg-[var(--line)] disabled:opacity-50"
        >
          {isPending ? "Atualizando..." : "Atualizar painel"}
        </button>
      </aside>
    );
  }

  if (!error) return null;

  return (
    <p role="status" className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
      {error}{" "}
      <Link href="/configuracoes/integracao" className="inline-flex min-h-11 items-center font-medium underline">
        Ver integrações
      </Link>
    </p>
  );
}
