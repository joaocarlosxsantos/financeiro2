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
    <div className="card flex flex-wrap items-center gap-2 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update("q", q.trim());
        }}
        className="relative min-w-48 flex-1"
      >
        <Search className="muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar descrição..."
          className="input-base h-9 py-0 pl-9 text-[0.8125rem]"
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

      <span className="muted mx-0.5 h-5 w-px bg-[var(--border)]" aria-hidden />

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
        className="input-base h-9 w-auto cursor-pointer py-0 text-[0.8125rem]"
      >
        <option value="">Todas as categorias</option>
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
          className="muted inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] hover:bg-[var(--surface-2)]"
        >
          <X className="size-3.5" />
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
        "h-9 cursor-pointer rounded-lg border px-3 text-[0.8125rem] font-medium transition-colors",
        active
          ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300"
          : "hover:bg-[var(--surface-2)]",
      )}
    >
      {children}
    </button>
  );
}
