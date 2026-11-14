"use client";

import Link from "next/link";
import { Check, Circle, SkipForward } from "lucide-react";
import type { OnboardingJourney, OnboardingStepId } from "@/lib/onboarding";
import { cn } from "@/lib/cn";
import { useOnboardingState } from "@/components/onboarding/use-onboarding-state";
import { TOUR_REQUEST_EVENT } from "@/components/onboarding/section-tour";
import type { UsageProfile } from "@/lib/usage-profile";

export function OnboardingCard({ journey, profile, userId, className }: {
  journey: OnboardingJourney;
  profile: UsageProfile;
  userId: string;
  className?: string;
}) {
  const { state, dispatch } = useOnboardingState(userId, profile);
  const steps = journey.steps.map((step) => ({
    ...step,
    status: step.status !== "concluido" && step.status !== "nao_aplicavel" && state.skippedSteps.includes(step.id) ? "pulado" as const : step.status,
  }));
  const applicable = steps.filter((step) => step.status !== "nao_aplicavel");
  const completed = applicable.filter((step) => step.status === "concluido").length;
  const skipped = applicable.filter((step) => step.status === "pulado").length;
  const next = steps.find((step) => step.status === "pendente" || step.status === "em_andamento");
  return (
    <aside id="primeiros-passos" className={cn("scroll-mt-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5", className)} aria-label="Trilha dos primeiros passos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-[var(--text)]">{completed === applicable.length && skipped === 0 ? "Trilha concluída" : "Seus primeiros passos"}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{completed} de {journey.applicableCount} etapas concluídas{skipped ? ` · ${skipped} adiadas` : ""}</p><p className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">Etapas adiadas e tour ficam salvos neste dispositivo.</p></div>
        <button type="button" onClick={() => window.dispatchEvent(new Event(TOUR_REQUEST_EVENT))} className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--text-brand)] underline">Conhecer o app</button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]" role="progressbar" aria-label="Progresso dos primeiros passos" aria-valuemin={0} aria-valuemax={journey.applicableCount} aria-valuenow={completed}>
        <div className="h-full rounded-full bg-[var(--acento)] transition-[width] motion-reduce:transition-none" style={{ width: `${journey.applicableCount ? (completed / journey.applicableCount) * 100 : 0}%` }} />
      </div>
      {next ? <div className="mt-4 rounded-xl bg-[var(--surface-2)] p-3.5">
        <p className="text-xs font-semibold text-[var(--text-brand)]">Próximo passo · {journey.steps.findIndex((step) => step.id === next.id) + 1} de 7</p>
        <h3 className="mt-1 text-sm font-semibold text-[var(--text)]">{next.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{next.evidence === "budget_created_category_review_not_tracked" ? "Um orçamento concluído conta como evidência; a revisão das categorias ainda não é registrada." : next.evidence === "dashboard_visit_not_tracked" ? "A visita ao painel ainda não é registrada como conclusão." : next.id === "notifications" ? "Ativar um canal é opcional; escolha e salve suas preferências em Notificações." : "Siga esta etapa no seu ritmo. Você pode adiá-la e retomá-la depois."}</p>
        {next.href ? <div className="mt-3 flex flex-wrap gap-2">
          <Link href={next.href} onClick={() => dispatch({ type: "resume-step", stepId: next.id })} className="inline-flex min-h-11 items-center rounded-lg bg-[var(--acento)] px-3.5 text-xs font-semibold text-[var(--on-acento)]">{next.actionLabel}</Link>
          {next.canSkip ? <button type="button" onClick={() => dispatch({ type: "skip", stepId: next.id })} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs text-[var(--text-muted)]"><SkipForward className="size-3.5" />Adiar etapa</button> : null}
        </div> : null}
      </div> : null}
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-[var(--text-muted)]">Ver as 7 etapas</summary>
        <ol className="space-y-2 border-t border-[var(--line)] pt-3">
          {steps.map((step, index) => <li key={step.id} className="flex items-start gap-2.5 py-1">
            {step.status === "concluido" ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-in)]" /> : <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" />}
            <div className="min-w-0 flex-1"><p className="text-xs font-medium text-[var(--text)]">{index + 1}. {step.title}</p><p className="text-[0.6875rem] text-[var(--text-muted)]">{step.status === "nao_aplicavel" ? "Não se aplica ao modo atual" : step.status === "pulado" ? "Adiada; você pode retomá-la" : step.status === "concluido" ? "Concluída" : step.status === "em_andamento" ? "Em andamento" : "Pendente"}</p></div>
            {step.status === "pulado" ? <button type="button" onClick={() => dispatch({ type: "resume-step", stepId: step.id as OnboardingStepId })} className="min-h-11 px-2 text-xs font-medium text-[var(--text-brand)] underline">Retomar</button> : null}
          </li>)}
        </ol>
      </details>
    </aside>
  );
}
