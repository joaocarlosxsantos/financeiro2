"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const SheetCloseContext = createContext<() => void>(() => {});
export const useSheetClose = () => useContext(SheetCloseContext);

/** Native modal semantics keep the background inert and keyboard focus inside. */
export function Sheet({ title, children, onClose }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const requestCloseRef = useRef<() => void>(() => {});
  const dragStart = useRef<number | null>(null);
  const titleId = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const marker = `sheet-${titleId}`;
    let closing = false;
    let timer: ReturnType<typeof setTimeout>;
    dialog.showModal();
    const viewport = window.visualViewport;
    function fitKeyboard() {
      if (!viewport) return;
      dialog.style.height = `${viewport.height}px`;
      dialog.style.top = `${viewport.offsetTop}px`;
    }
    fitKeyboard();
    viewport?.addEventListener("resize", fitKeyboard);
    viewport?.addEventListener("scroll", fitKeyboard);
    document.body.style.overflow = "hidden";
    window.history.pushState({ ...window.history.state, sheet: marker }, "");
    const frame = requestAnimationFrame(() => setVisible(true));

    function dismiss() {
      if (closing) return;
      closing = true;
      setVisible(false);
      if (window.history.state?.sheet === marker) window.history.back();
      timer = setTimeout(() => {
        dialog.close();
        closeRef.current();
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320);
    }
    requestCloseRef.current = dismiss;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); }
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", dismiss);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("popstate", dismiss);
      document.removeEventListener("keydown", onKeyDown);
      viewport?.removeEventListener("resize", fitKeyboard);
      viewport?.removeEventListener("scroll", fitKeyboard);
      dialog.close();
      if (window.history.state?.sheet === marker) {
        const previousState = { ...window.history.state };
        delete previousState.sheet;
        window.history.replaceState(previousState, "");
      }
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [titleId]);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); requestCloseRef.current(); }}
      onClick={(event) => { if (event.target === event.currentTarget) requestCloseRef.current(); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-[var(--text)] backdrop:bg-black/60"
    >
      {/* Keep the standard property: the CSS optimizer retains only the WebKit alias. */}
      <section style={{ backdropFilter: "blur(20px) saturate(140%)" }} className={cn(
        "glass absolute inset-x-0 bottom-0 mx-auto flex max-h-[90%] w-full max-w-lg flex-col rounded-t-2xl pb-[max(12px,env(safe-area-inset-bottom))] transition-transform duration-[320ms] ease-[var(--ease-out)] motion-reduce:transition-none",
        visible ? "translate-y-0" : "translate-y-full",
      )}>
        <div className="shrink-0 touch-none px-4 pt-2"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (dragStart.current !== null && event.clientY - dragStart.current > 64) requestCloseRef.current();
            dragStart.current = null;
          }}
          onPointerCancel={() => { dragStart.current = null; }}
        >
          <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-[var(--text-subtle)]" />
          <div className="flex min-h-14 items-center justify-between gap-3">
            <h2 id={titleId} className="text-heading">{title}</h2>
            <button type="button" aria-label={`Fechar ${title}`} onClick={() => requestCloseRef.current()}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:bg-[var(--surface-2)]">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-2">
          <SheetCloseContext.Provider value={() => requestCloseRef.current()}>{children}</SheetCloseContext.Provider>
        </div>
      </section>
    </dialog>
  );
}
