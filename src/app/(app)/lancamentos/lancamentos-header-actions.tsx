"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeriodSwitcher } from "./period-switcher";
import { ExportMenu } from "./export-menu";
import { TransferDialog } from "./transfer-dialog";
import type { PlainAccount } from "./types";
import type { MonthRef } from "@/lib/dates";

export function LancamentosHeaderActions({
  monthRef,
  customRange,
  accounts,
  userId,
}: {
  monthRef: MonthRef;
  customRange: { from: string; to: string } | null;
  accounts: PlainAccount[];
  userId: string;
}) {
  const [transferOpen, setTransferOpen] = useState(false);

  function scrollToComposer() {
    const input = document.querySelector<HTMLInputElement>('input[name="description"]');
    input?.focus();
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
      <PeriodSwitcher value={monthRef} range={customRange} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setTransferOpen(true)}
        className="cursor-pointer gap-1.5 text-xs font-medium text-[var(--text-brand)] hover:bg-[var(--color-save-soft)]"
      >
        <ArrowLeftRight className="size-3.5" />
        <span className="hidden sm:inline">Nova transferência</span>
        <span className="sm:hidden">Transferir</span>
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={scrollToComposer}
        className="cursor-pointer gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] lg:hidden"
        title="Novo lançamento"
      >
        <Plus className="size-3.5" />
        <span>Novo</span>
      </Button>

      <ExportMenu />

      {transferOpen ? (
        <TransferDialog
          isOpen={transferOpen}
          onClose={() => setTransferOpen(false)}
          accounts={accounts}
          userId={userId}
        />
      ) : null}
    </div>
  );
}
