"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { PlainCategory } from "./types";

export function Filters({ categories, accounts }: { categories: PlainCategory[]; accounts: Array<{ id: string; name: string; type: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (key === "acc") sp.delete("accountId");
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const kind = params.get("kind") ?? "";
  const nature = params.get("nature") ?? "";
  const cat = params.get("cat") ?? "";
  const acc = params.get("acc") ?? "";
  const selectedAccount = params.get("accountId") || (acc !== "CARD" && acc !== "OTHER" ? acc : "");
  const hasFilters = Boolean(kind || nature || cat || acc || selectedAccount || params.get("q"));

  return (
    <div className="card flex flex-wrap items-center gap-2 p-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update("q", q.trim());
        }}
        className="relative min-w-44 flex-1"
      >
        <Search className="muted pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <input aria-label="Buscar descrição..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar descrição..."
          className="min-h-12 min-w-0 max-w-full text-base! input-base h-12 py-0 pl-8 text-base md:h-8 md:min-h-8 md:text-xs"
        />
      </form>

      <Chip active={kind === "EXPENSE"} onClick={() => update("kind", kind === "EXPENSE" ? "" : "EXPENSE")}>
        Só saídas
      </Chip>
      <Chip active={kind === "INCOME"} onClick={() => update("kind", kind === "INCOME" ? "" : "INCOME")}>
        Só entradas
      </Chip>
      <Chip active={nature === "FIXED"} onClick={() => update("nature", nature === "FIXED" ? "" : "FIXED")}>
        Fixos
      </Chip>
      <Chip
        active={nature === "VARIABLE"}
        onClick={() => update("nature", nature === "VARIABLE" ? "" : "VARIABLE")}
      >
        Variáveis
      </Chip>

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" aria-hidden />

      <Chip active={acc === "OTHER"} onClick={() => update("acc", acc === "OTHER" ? "" : "OTHER")}>
        Sem cartão
      </Chip>
      <Chip active={acc === "CARD"} onClick={() => update("acc", acc === "CARD" ? "" : "CARD")}>
        Cartão
      </Chip>

      <select aria-label="Filtrar por conta" value={selectedAccount} onChange={(e) => update("acc", e.target.value)} className="input-base min-h-12 max-w-full cursor-pointer text-base md:min-h-8 md:text-xs">
        <option value="">Todas as contas</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.type === "INVESTMENT" ? " · Investimento" : ""}</option>)}
      </select>

      <select
        value={cat}
        onChange={(e) => update("cat", e.target.value)}
        aria-label="Filtrar por categoria"
        className="min-h-12 min-w-0 max-w-full text-base! input-base h-12 w-auto max-w-full cursor-pointer py-0 text-base md:h-8 md:min-h-8 md:text-xs"
      >
        <option value="">Todas as categorias</option>
        <option value="NONE">Sem categoria</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="min-h-11 min-w-11 muted inline-flex h-11 cursor-pointer items-center gap-1 rounded-[var(--radius-button)] px-3 text-sm hover:bg-[var(--surface-2)] md:h-8 md:px-2 md:text-xs"
        >
          <X className="size-3" />
          Limpar
        </button>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["min-h-11 min-w-11", cn(
        "h-11 cursor-pointer rounded-[var(--radius-button)] border px-3 text-sm font-medium transition-colors md:h-8 md:px-2.5 md:text-xs",
        active
          ? "border-[var(--text-brand)] bg-[var(--color-save-soft)] text-[var(--text-brand)]"
          : "border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-muted)]",
      )].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
