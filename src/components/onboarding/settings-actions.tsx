import Link from "next/link";
import { ArrowRight, ListChecks, RotateCcw } from "lucide-react";

export function OnboardingSettingsActions() {
  return (
    <nav aria-label="Ajuda para começar" className="mb-4 flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:flex-row sm:flex-wrap">
      <Link href="/painel#primeiros-passos" className="inline-flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--acento)] px-4 text-sm font-semibold text-[var(--on-acento)] sm:justify-start">
        <span className="inline-flex items-center gap-2"><ListChecks className="size-4" />Retomar primeiros passos</span><ArrowRight className="size-4" />
      </Link>
      <Link href="/painel?tour=rever" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]">
        <RotateCcw className="size-4" />Rever tour
      </Link>
    </nav>
  );
}
