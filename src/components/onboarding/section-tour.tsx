"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { getOnboardingTour, type TourStopId } from "@/lib/onboarding";
import { useUsageProfile } from "@/components/usage-profile";
import { useOnboardingState } from "./use-onboarding-state";

export const TOUR_REQUEST_EVENT = "mutano-onboarding-tour-request";

const COPY: Record<TourStopId, { purpose: string; example: string; action: string }> = {
  overview: { purpose: "Veja um retrato do seu mês e os pontos que pedem atenção.", example: "Compare o que entrou, saiu e ficou disponível.", action: "Abrir esta seção" },
  activity: { purpose: "Registre e confira as movimentações das suas contas.", example: "Use lançamentos para uma despesa e importar para um extrato.", action: "Ver movimentações" },
  planning: { purpose: "Organize compromissos, limites, metas e projeções.", example: "Defina um limite mensal no orçamento e acompanhe o uso.", action: "Explorar planejamento" },
  integration: { purpose: "Conecte bancos quando seu modo de uso permite integração.", example: "A autorização bancária acontece no fluxo seguro do Pluggy.", action: "Ver conexões" },
  account: { purpose: "Ajuste seus dados, contas, categorias e preferências.", example: "Escolha como quer receber notificações.", action: "Abrir configurações" },
  notifications: { purpose: "Escolha se quer receber avisos no app, push ou Telegram.", example: "Recusar um canal é uma escolha válida e não bloqueia o app.", action: "Escolher avisos" },
};

export function SectionTour({ userId }: { userId: string }) {
  const profile = useUsageProfile();
  const pathname = usePathname();
  const stops = useMemo(() => getOnboardingTour(profile), [profile]);
  const { state, dispatch } = useOnboardingState(userId, profile);
  const [open, setOpen] = useState(false);
  const modalOpen = open || state.tour.status === "active";
  const currentId = state.tour.stopId ?? stops[0]?.id;
  const currentIndex = Math.max(0, stops.findIndex((stop) => stop.id === currentId));
  const current = stops[currentIndex];

  useEffect(() => {
    const restart = () => dispatch({ type: "tour-start" });
    window.addEventListener(TOUR_REQUEST_EVENT, restart);
    if (new URLSearchParams(window.location.search).get("tour") === "rever") {
      restart();
      window.history.replaceState(null, "", window.location.pathname);
    }
    return () => window.removeEventListener(TOUR_REQUEST_EVENT, restart);
  }, [dispatch, pathname, state.tour.status]);

  if (!current) return null;

  function start() { dispatch({ type: "tour-start" }); setOpen(true); }
  function dismiss() { dispatch({ type: "tour-dismiss" }); setOpen(false); }
  function pause() { dispatch({ type: "tour-pause" }); setOpen(false); }
  function move(index: number) {
    if (index >= stops.length) { dispatch({ type: "tour-complete" }); setOpen(false); return; }
    const target = stops[Math.max(0, index)];
    if (target) dispatch({ type: "tour-go", stopId: target.id });
  }

  return (
    <>
      {state.tour.status === "not_started" ? (
        <aside className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Conhecer o aplicativo">
          <div><h2 className="text-sm font-semibold text-[var(--text)]">Conhecer o app</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Um tour curto mostra para que serve cada seção. Você pode pausar quando quiser.</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={start} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--acento)] px-4 text-sm font-semibold text-[var(--on-acento)]"><Compass className="size-4" />Começar tour</button>
            <button type="button" onClick={dismiss} className="inline-flex min-h-11 items-center px-3 text-sm text-[var(--text-muted)]">Agora não</button>
          </div>
        </aside>
      ) : null}
      {modalOpen ? (
        <Sheet title={`Tour do app · ${currentIndex + 1} de ${stops.length}`} onClose={pause}>
          <div className="space-y-5" aria-live="polite">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-brand)]"><Compass className="size-4" />Parada {currentIndex + 1} de {stops.length}</div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">{current.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{COPY[current.id].purpose}</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]"><strong>Exemplo:</strong> {COPY[current.id].example}</div>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">No celular, use o menu Mais para encontrar as outras seções. O tour não altera seus dados e você pode pausar a qualquer momento.</p>
            <Link href={current.href} onClick={() => dispatch({ type: "tour-go", stopId: current.id })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]">{COPY[current.id].action}<ChevronRight className="size-4" /></Link>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-4">
              <button type="button" onClick={() => move(currentIndex - 1)} disabled={currentIndex === 0} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-[var(--text-muted)] disabled:opacity-50"><ChevronLeft className="size-4" />Voltar</button>
              <div className="flex gap-2">
                <button type="button" onClick={pause} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-[var(--text-muted)]"><X className="size-4" />Pausar</button>
                <button type="button" onClick={() => move(currentIndex + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--acento)] px-4 text-sm font-semibold text-[var(--on-acento)]">{currentIndex === stops.length - 1 ? <><Check className="size-4" />Concluir</> : <>Próxima seção<ChevronRight className="size-4" /></>}</button>
              </div>
            </div>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
