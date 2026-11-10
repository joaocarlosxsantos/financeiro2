"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return <section role="alert" className="card min-w-0 space-y-4 p-6">
    <h1 className="text-display">Não foi possível carregar os dados</h1>
    <p className="text-sm text-[var(--text-muted)]">Tente novamente para recuperar esta tela.</p>
    <Button className="min-h-11" onClick={retry}>Tentar novamente</Button>
  </section>;
}
