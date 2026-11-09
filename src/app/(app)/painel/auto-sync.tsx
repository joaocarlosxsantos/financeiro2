"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { autoSyncOpenFinance } from "@/server/actions/open-finance";

// Ao abrir/atualizar o painel, tenta sincronizar (o servidor aplica o gap de 5 min).
export function AutoSync() {
  const router = useRouter();
  useEffect(() => {
    autoSyncOpenFinance().then((r) => { if (r.synced) router.refresh(); }).catch(() => {});
  }, [router]);
  return null;
}
