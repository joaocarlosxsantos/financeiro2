"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Sheet } from "@/components/sheet";
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
  const descId = useId();
  const danger = state.tone === "danger";
  return (
    <Sheet title={state.title} role="alertdialog" maxWidth="sm" describedBy={state.description ? descId : undefined} onClose={() => onSettle(false)}>
      <div className={cn("transition-opacity duration-150 motion-reduce:transition-none", closing && "opacity-0")}>
        <div className="flex items-start gap-3">
          {danger ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-money-out-soft)] text-[var(--text-out)]">
              <AlertTriangle className="size-4.5" />
            </span>
          ) : null}
          <div className="min-w-0">

            {state.description ? (
              <p id={descId} className="muted mt-1.5 text-sm leading-relaxed">
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
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 text-sm font-medium text-[var(--text)] motion-reduce:transition-none transition-colors hover:bg-[var(--surface-3)] focus-visible:ring-2 focus-visible:ring-[var(--acento)] focus-visible:ring-offset-2 focus-visible:outline-none sm:h-10 sm:w-auto"
          >
            {state.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            className={cn(
              "inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-medium motion-reduce:transition-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:h-10 sm:w-auto",
              danger
                ? "bg-[var(--danger-fill)] text-[var(--on-danger)] hover:brightness-95 focus-visible:ring-[var(--text-out)]"
                : "bg-[var(--acento)] text-[var(--on-acento)] hover:opacity-90 focus-visible:ring-[var(--acento)]",
            )}
          >
            {state.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
