"use client";

import { useTransition } from "react";
import { Pause, Play, Trash2, Users } from "lucide-react";
import { deleteBillRule, toggleBillRule } from "@/server/actions/bills";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { MonthRef } from "@/lib/dates";

export type PlainBillRule = {
  id: string;
  name: string;
  type: "INDIVIDUAL" | "GROUP";
  active: boolean;
  groupingName: string | null;
  participants: { id: string; name: string }[];
  generated: boolean;
};

/**
 * Lista de todas as regras recorrentes (independente do mês) com
 * pausar/retomar e excluir. Contas já geradas continuam existindo mesmo se a
 * regra for excluída (viram avulsas) — ver comentário em `deleteBillRule`.
 */
export function BillRulesManager({ rules, monthRef }: { rules: PlainBillRule[]; monthRef: MonthRef }) {
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  if (!rules.length) {
    return <p className="muted text-[0.8125rem]">Nenhuma conta recorrente ainda.</p>;
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: `Excluir a regra "${name}"?`,
      description: "As contas já geradas de meses anteriores continuam salvas, só viram avulsas.",
      confirmLabel: "Excluir",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => void (await deleteBillRule(id)));
  }

  return (
    <ul className={`divide-y rounded-xl border ${pending ? "opacity-60" : ""}`}>
      {rules.map((r) => (
        <li key={r.id} className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] font-medium">
                {r.name}
                {r.type === "GROUP" ? <Users className="muted ml-1.5 inline size-3 align-middle" /> : null}
              </p>
              <p className="muted truncate text-xs">
                {r.groupingName ? `${r.groupingName} · ` : ""}
                {!r.active
                  ? "pausada"
                  : r.generated
                    ? `já gerada em ${monthRef.month}/${monthRef.year}`
                    : "pendente este mês"}
                {r.type === "GROUP" && r.participants.length
                  ? ` · ${r.participants.map((p) => p.name).join(", ")}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              title={r.active ? "Pausar" : "Retomar"}
              onClick={() => start(async () => void (await toggleBillRule(r.id, !r.active)))}
              className="muted cursor-pointer rounded-lg p-1.5 hover:bg-[var(--surface-2)]"
            >
              {r.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <button
              type="button"
              title="Excluir regra"
              onClick={() => void remove(r.id, r.name)}
              className="muted cursor-pointer rounded-lg p-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
