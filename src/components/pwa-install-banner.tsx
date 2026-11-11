"use client";

import { useEffect, useRef, useState } from "react";
import { X, Share, Download } from "lucide-react";

type InstallState =
  | "idle"         // verificando (SSR + 1º render, não há window)
  | "android"      // beforeinstallprompt disponível
  | "ios"          // iOS Safari, sem beforeinstallprompt
  | "dismissed"    // usuário fechou/adiou
  | "installed";   // já instalado (standalone) ou após instalação

const LS_KEY = "mutano-pwa-banner-dismissed";

/** Lê o timestamp de dismiss do localStorage com try/catch. */
export function getDismissedAt(): number {
  try {
    return Number(localStorage.getItem(LS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Persiste o timestamp de dismiss com try/catch. */
export function setDismissedAt() {
  try {
    localStorage.setItem(LS_KEY, String(Date.now()));
  } catch {
    // Falha silenciosa; o banner simplesmente não recorda o dismiss.
  }
}

/** Dias que o banner fica escondido após dismiss. */
const SNOOZE_DAYS = 14;

/**
 * Calcula o estado inicial do banner. Chamado apenas no cliente (lazy init).
 * Retorna "idle" quando precisa aguardar o evento beforeinstallprompt.
 */
function computeInitialState(): InstallState {
  if (typeof window === "undefined") return "idle";
  if (window.matchMedia("(display-mode: standalone)").matches) return "installed";

  const dismissedAt = getDismissedAt();
  const snoozeMs = SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  if (dismissedAt && Date.now() - dismissedAt < snoozeMs) return "dismissed";

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;
  if (isIOS) return "ios";

  // Aguarda beforeinstallprompt (Chrome/Edge Android e desktop).
  return "idle";
}

export function PwaInstallBanner() {
  // Lazy initialization: computeInitialState() roda apenas no cliente, uma vez.
  const [state, setState] = useState<InstallState>(computeInitialState);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    // Só registra o listener quando ainda aguardamos beforeinstallprompt.
    if (state !== "idle") return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      deferredPromptRef.current = e;
      setState("android");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, [state]);

  function handleInstall() {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
     
    prompt.prompt();
    (prompt.userChoice as Promise<{ outcome: string }>).then(() => {
      deferredPromptRef.current = null;
      setState("installed");
    });
  }

  function handleDismiss() {
    setDismissedAt();
    setState("dismissed");
  }

  if (state !== "android" && state !== "ios") return null;

  return (
    <div
      role="complementary"
      aria-label="Instalar aplicativo"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] p-4 shadow-lg lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
    >
      <div className="flex items-start gap-3">
        {/* Ícone do app */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-xl"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-[var(--text)]">
            Instalar Mutano Contas
          </p>

          {state === "ios" ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              Toque em{" "}
              <Share
                className="inline size-3.5 align-text-bottom"
                aria-label="Compartilhar"
              />{" "}
              e depois em <strong>Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              Acesse offline e tenha atalho na tela inicial.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fechar sugestão de instalação"
          className="shrink-0 cursor-pointer rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {state === "android" && (
        <button
          type="button"
          onClick={handleInstall}
          className="mt-3 flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--acento)] px-4 text-sm font-semibold text-[var(--on-acento)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]"
        >
          <Download className="size-4" aria-hidden="true" />
          Instalar app
        </button>
      )}
    </div>
  );
}
