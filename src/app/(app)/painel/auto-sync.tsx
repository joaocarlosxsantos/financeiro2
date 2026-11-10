"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { autoSyncOpenFinance } from "@/server/actions/open-finance";

// Ao abrir/atualizar o painel, tenta sincronizar (o servidor aplica o gap de 5 min).
export function AutoSync() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    autoSyncOpenFinance().then((result) => {
      if (!active) return;
      setError(result.error ?? null);
      if (result.synced) router.refresh();
    }).catch(() => {
      if (active) setError("A sincronização automática está indisponível. Você pode tentar novamente nas integrações.");
    });
    return () => { active = false; };
  }, [router]);
  if (!error) return null;
  return <p role="status" className="mb-4 rounded-xl border bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
    {error}{" "}<Link href="/configuracoes/integracao" className="inline-flex min-h-11 items-center font-medium underline">Ver integrações</Link>
  </p>;
}
