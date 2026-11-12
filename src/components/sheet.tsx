"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const SheetCloseContext = createContext<() => void>(() => {});
export const useSheetClose = () => useContext(SheetCloseContext);

export type SheetMaxWidth = "sm" | "md" | "lg" | "xl" | "2xl";

const maxWidthClasses: Record<SheetMaxWidth, string> = {
  sm: "max-w-sm",   // 384px - confirmações e alertas
  md: "max-w-md",   // 448px - senhas e diálogos curtos
  lg: "max-w-lg",   // 512px - padrão: lançamentos, transferências
  xl: "max-w-xl",   // 576px - splits e formulários ricos
  "2xl": "max-w-2xl", // 672px - tabelas e integrações complexas
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Componente modal e sheet compartilhado da aplicação.
 *
 * - No MOBILE (< 768px): renderiza como bottom-sheet (ancorado na base, drag para dispensar, safe-area).
 * - No DESKTOP (>= 768px): renderiza CENTRALIZADO na viewport com overlay backdrop,
 *   largura máxima sensata, rolagem interna se alto, foco preso (focus trap), foco devolvido e suporte a Esc / clique fora.
 */
export function Sheet({
  title,
  children,
  onClose,
  closeDisabled = false,
  role = "dialog",
  describedBy,
  maxWidth = "lg",
}: {
  title: string;
  children?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  role?: "dialog" | "alertdialog";
  describedBy?: string;
  maxWidth?: SheetMaxWidth;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);
  const requestCloseRef = useRef<() => void>(() => {});
  const dragStart = useRef<number | null>(null);
  const titleId = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    closeRef.current = onClose;
    disabledRef.current = closeDisabled;
  }, [onClose, closeDisabled]);

  useEffect(() => {
    const dialog = dialogRef.current!;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousHistoryState = window.history.state;
    const marker = `sheet-${titleId}`;
    let closing = false;
    let timer: ReturnType<typeof setTimeout>;

    dialog.showModal();

    // Foco inicial: prioriza data-autofocus / autofocus, depois primeiro elemento interativo.
    // Usamos preventScroll: true para evitar que o navegador role o container do diálogo
    // enquanto o painel ainda está transicionando ou fora do campo de visão.
    const initialFocus =
      dialog.querySelector<HTMLElement>("[data-autofocus], [autofocus]") ||
      dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    initialFocus?.focus({ preventScroll: true });
    dialog.scrollTop = 0;

    // Visual viewport adapt para teclado em navegadores mobile
    const viewport = window.visualViewport;
    function fitKeyboard() {
      if (!viewport || window.matchMedia("(min-width: 768px)").matches) return;
      const isKeyboardOpen = viewport.height < window.innerHeight * 0.85;
      if (isKeyboardOpen) {
        dialog.style.height = `${viewport.height}px`;
        dialog.style.top = `${viewport.offsetTop}px`;
        dialog.style.bottom = "auto";
      } else {
        dialog.style.height = "";
        dialog.style.top = "";
        dialog.style.bottom = "";
      }
      dialog.scrollTop = 0;
    }
    fitKeyboard();
    viewport?.addEventListener("resize", fitKeyboard);
    viewport?.addEventListener("scroll", fitKeyboard);

    document.body.style.overflow = "hidden";
    window.history.pushState({ ...window.history.state, sheet: marker }, "");
    const frame = requestAnimationFrame(() => {
      setVisible(true);
      dialog.scrollTop = 0;
    });

    function dismiss(navigateBack = true) {
      if (closing || disabledRef.current) return;
      closing = true;
      setVisible(false);

      if (navigateBack && window.history.state?.sheet === marker) {
        window.history.back();
      }

      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduceMotion ? 0 : isDesktop ? 150 : 320;

      timer = setTimeout(() => {
        dialog.close();
        closeRef.current();
      }, duration);
    }
    requestCloseRef.current = dismiss;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return;
      }

      // Focus trap garantido para teclado (acessibilidade WAI-ARIA)
      if (event.key === "Tab") {
        const panel = panelRef.current || dialog;
        const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    function onPopState() {
      if (
        window.history.state?.sheet !== marker &&
        dialog ===
          document
            .querySelectorAll("dialog[open]")
            .item(document.querySelectorAll("dialog[open]").length - 1)
      ) {
        dismiss(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
      viewport?.removeEventListener("resize", fitKeyboard);
      viewport?.removeEventListener("scroll", fitKeyboard);

      dialog.style.height = "";
      dialog.style.top = "";
      dialog.style.bottom = "";

      dialog.close();

      if (window.history.state?.sheet === marker) {
        window.history.replaceState(previousHistoryState, "");
      }
      document.body.style.overflow = previousOverflow;

      // Devolve o foco ao elemento acionador original
      previousFocus?.focus({ preventScroll: true });
    };
  }, [titleId]);

  return (
    <dialog
      ref={dialogRef}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestCloseRef.current();
      }}
      onClick={(event) => {
        // Clique no backdrop fecha o diálogo
        if (event.target === event.currentTarget) {
          requestCloseRef.current();
        }
      }}
      className={cn(
        "fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-[var(--text)]",
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        // Mobile: alinha na base (bottom sheet) com respiro para safe-area-inset-top
        "pt-[max(16px,env(safe-area-inset-top))] open:flex open:items-end open:justify-center",
        // Desktop: centraliza perfeitamente no centro da tela com respiro
        "md:p-0 md:px-6 md:py-8 md:open:items-center"
      )}
    >
      <section
        ref={panelRef}
        data-sheet-panel
        style={{ backdropFilter: "blur(20px) saturate(140%)" }}
        className={cn(
          "glass relative flex w-full min-h-0 flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)]",
          maxWidthClasses[maxWidth] ?? "max-w-lg",
          // Mobile: bottom sheet com altura até 90% da viewport e cantos superiores arredondados
          "max-h-[90%] rounded-t-2xl pb-[max(12px,env(safe-area-inset-bottom))]",
          // Desktop: modal centralizado com cantos arredondados e respiro garantido
          "md:max-h-[min(88dvh,760px)] md:rounded-2xl md:pb-4 md:shadow-2xl",
          // Transição suave
          "transition-[transform,opacity] duration-[320ms] ease-[var(--ease-out)] motion-reduce:transition-none md:duration-150",
          visible
            ? "translate-y-0 md:scale-100 md:opacity-100"
            : "translate-y-full md:translate-y-0 md:scale-95 md:opacity-0"
        )}
      >
        {/* Handle de arrastar (somente mobile) e barra de cabeçalho */}
        <div
          className="shrink-0 touch-none px-5 pt-2"
          onPointerDown={(event) => {
            if (window.matchMedia("(min-width: 768px)").matches) return;
            if ((event.target as HTMLElement).closest("button")) return;
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (dragStart.current !== null && event.clientY - dragStart.current > 64) {
              requestCloseRef.current();
            }
            dragStart.current = null;
          }}
          onPointerCancel={() => {
            dragStart.current = null;
          }}
        >
          {/* Barra indicadora de puxar para baixo no mobile */}
          <div
            aria-hidden="true"
            className="mx-auto my-1.5 h-1 w-9 rounded-full bg-[var(--text-subtle)] md:hidden"
          />

          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--line)] pb-3 pt-1">
            <h2 id={titleId} className="text-heading font-semibold tracking-tight text-[var(--text)]">
              {title}
            </h2>
            <button
              type="button"
              aria-label={`Fechar ${title}`}
              disabled={closeDisabled}
              onClick={() => requestCloseRef.current()}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--acento)] disabled:opacity-50"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo com rolagem interna suave quando ultrapassa a altura da viewport */}
        <div data-sheet-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          <SheetCloseContext.Provider value={() => requestCloseRef.current()}>
            {children}
          </SheetCloseContext.Provider>
        </div>
      </section>
    </dialog>
  );
}
