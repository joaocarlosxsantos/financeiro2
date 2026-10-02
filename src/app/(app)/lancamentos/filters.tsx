"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { PlainCategory } from "./types";

export function Filters({ categories }: { categories: PlainCategory[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const kind = params.get("kind") ?? "";
  const nature = params.get("nature") ?? "";
  const cat = params.get("cat") ?? "";
  const acc = params.get("acc") ?? "";
  const hasFilters = Boolean(kind || nature || cat || acc || params.get("q"));

  return (
    <div className="card flex flex-wrap items-center gap-1.5 p-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update("q", q.trim());
        }}
        className="relative min-w-44 flex-1"
      >
        <Search className="muted pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar descrição..."
          className="input-base h-8 py-0 pl-8 text-xs"
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
        Conta corrente
      </Chip>
      <Chip active={acc === "CARD"} onClick={() => update("acc", acc === "CARD" ? "" : "CARD")}>
        Cartão
      </Chip>

      <select
        value={cat}
        onChange={(e) => update("cat", e.target.value)}
        aria-label="Filtrar por categoria"
        className="input-base h-8 w-auto cursor-pointer py-0 text-xs"
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
          className="muted inline-flex h-8 cursor-pointer items-center gap-1 rounded-[var(--radius-button)] px-2 text-xs hover:bg-[var(--surface-2)]"
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
      className={cn(
        "h-8 cursor-pointer rounded-[var(--radius-button)] border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-[var(--text-brand)] bg-[var(--color-save-soft)] text-[var(--text-brand)]"
          : "border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-muted)]",
      )}
    >
      {children}
    </button>
  );
}
