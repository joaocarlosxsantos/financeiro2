"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" pinta o botão de confirmar de vermelho e mostra um ícone de alerta — use para exclusão. */
  tone?: "danger" | "default";
};

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Troca `window.confirm`/`window.alert` (bloqueiam a aba inteira, não seguem o
 * tema e não são responsivos) por um modal do próprio site. Monte uma vez perto
 * da raiz e use `useConfirm()` em qualquer componente cliente abaixo dela.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [closing, setClosing] = useState(false);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
      setClosing(false);
    });
  }, []);

  const settle = useCallback(
    (result: boolean) => {
      setClosing(true);
      // Espera a transição de saída antes de desmontar, senão o modal some
      // de repente em vez de recolher — pequeno, mas evita o susto.
      window.setTimeout(() => {
        state?.resolve(result);
        setState(null);
      }, 120);
    },
    [state],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? <Dialog state={state} closing={closing} onSettle={settle} /> : null}
    </ConfirmContext.Provider>
  );
}

/** Retorna uma função `confirm(opções) => Promise<boolean>` que substitui `window.confirm`. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm precisa ser usado dentro de <ConfirmProvider>.");
  }
  return ctx;
}

function Dialog({
  state,
  closing,
  onSettle,
}: {
  state: ConfirmState;
  closing: boolean;
  onSettle: (result: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const danger = state.tone === "danger";

  useEffect(() => {
    // Foca o botão de cancelar por padrão — ação segura, e é o que "Esc" já faz.
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onSettle(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onSettle]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className={cn(
          "absolute inset-0 bg-black/45 transition-opacity duration-150",
          closing ? "opacity-0" : "opacity-100",
        )}
        onClick={() => onSettle(false)}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={state.description ? descId : undefined}
        className={cn(
          "card relative w-full max-w-sm p-5 transition-all duration-150",
          "rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:pb-5",
          closing
            ? "translate-y-2 opacity-0 sm:translate-y-0 sm:scale-95"
            : "translate-y-0 opacity-100 sm:scale-100",
        )}
      >
        <div className="flex items-start gap-3">
          {danger ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300">
              <AlertTriangle className="size-4.5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={titleId} className="text-[0.9375rem] font-semibold tracking-tight">
              {state.title}
            </h2>
            {state.description ? (
              <p id={descId} className="muted mt-1.5 text-[0.8125rem] leading-relaxed">
                {state.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-autofocus
            onClick={() => onSettle(false)}
            className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-xl border bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
          >
            {state.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            className={cn(
              "inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto",
              danger
                ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500"
                : "bg-brand-600 shadow-sm hover:bg-brand-700 focus-visible:ring-brand-500",
            )}
          >
            {state.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
