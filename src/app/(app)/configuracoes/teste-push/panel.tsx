"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, AlertCircle, AlertTriangle, Smartphone, Send, ArrowLeft } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const emptySubscribe = () => () => {};

function subscribeStandalone(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener?.("change", callback);
  return () => mql.removeEventListener?.("change", callback);
}

function getStandaloneSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as unknown as { standalone: boolean }).standalone))
  );
}

function getHasSupportSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function getPermissionSnapshot(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function PushTestPanel() {
  const isStandalone = useSyncExternalStore(subscribeStandalone, getStandaloneSnapshot, () => false);
  const hasSupport = useSyncExternalStore(emptySubscribe, getHasSupportSnapshot, () => false);
  const initialPermission = useSyncExternalStore(emptySubscribe, getPermissionSnapshot, () => "default");

  const [overridePermission, setOverridePermission] = useState<NotificationPermission | null>(null);
  const permission = overridePermission ?? initialPermission;

  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!hasSupport) return;

    // Verifica se já existe subscription ativa no Service Worker
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setSubscription(sub);
      })
      .catch((err) => {
        console.warn("[Push] Erro ao consultar inscrição existente:", err);
      });
  }, [hasSupport]);

  const handleSubscribe = () => {
    setFeedback(null);
    if (!hasSupport) {
      setFeedback({ type: "error", message: "Este navegador não suporta Web Push." });
      return;
    }

    if (!publicKey) {
      setFeedback({
        type: "error",
        message: "Chave pública VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY) não configurada no servidor.",
      });
      return;
    }

    startTransition(async () => {
      try {
        // Pedir permissão no gesto direto do clique
        const perm = await Notification.requestPermission();
        setOverridePermission(perm);

        if (perm !== "granted") {
          setFeedback({
            type: "error",
            message:
              perm === "denied"
                ? "Permissão de notificação foi bloqueada nas configurações do sistema/navegador."
                : "Permissão de notificação não foi concedida.",
          });
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        setSubscription(sub);
        setFeedback({
          type: "success",
          message: "Notificações ativadas com sucesso! Você já pode enviar um teste abaixo.",
        });
      } catch (err: unknown) {
        console.error("[Push] Erro ao registrar subscription:", err);
        setFeedback({
          type: "error",
          message: `Falha ao registrar notificação: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
  };

  const handleSendTest = () => {
    setFeedback(null);
    if (!subscription) {
      setFeedback({ type: "error", message: "Nenhuma inscrição ativa para enviar o teste." });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/teste-push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subscription }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || `Erro HTTP ${res.status}`);
        }

        setFeedback({
          type: "success",
          message: "Notificação de teste disparada! Bloqueie a tela do iPhone ou saia do app para conferir.",
        });
      } catch (err: unknown) {
        console.error("[Push] Erro ao disparar teste:", err);
        setFeedback({
          type: "error",
          message: `Falha ao disparar teste: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/configuracoes"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft className="size-4" />
          Voltar para Configurações
        </Link>
      </div>

      {/* Cartão de Diagnóstico de Ambiente */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text)] flex items-center gap-2">
          <Smartphone className="size-5 text-[var(--text-muted)]" />
          Diagnóstico do Dispositivo & Ambiente
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          {/* Status Standalone / PWA */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-1">
            <span className="text-xs text-[var(--text-muted)] block">Instalado na Tela Inicial (PWA)</span>
            <div className="flex items-center gap-2 font-medium">
              {isStandalone === null ? (
                <span className="text-[var(--text-muted)]">Verificando...</span>
              ) : isStandalone ? (
                <span className="text-[var(--text-in)] flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Sim (Modo Standalone)
                </span>
              ) : (
                <span className="text-[var(--text-warn)] flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> No Navegador (Não instalado)
                </span>
              )}
            </div>
          </div>

          {/* Suporte Web Push */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-1">
            <span className="text-xs text-[var(--text-muted)] block">Suporte Web Push (Browser)</span>
            <div className="flex items-center gap-2 font-medium">
              {hasSupport === null ? (
                <span className="text-[var(--text-muted)]">Verificando...</span>
              ) : hasSupport ? (
                <span className="text-[var(--text-in)] flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Suportado
                </span>
              ) : (
                <span className="text-[var(--text-out)] flex items-center gap-1.5">
                  <AlertCircle className="size-4" /> Não suportado
                </span>
              )}
            </div>
          </div>

          {/* Permissão de Notificação */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-1">
            <span className="text-xs text-[var(--text-muted)] block">Permissão de Notificações</span>
            <div className="flex items-center gap-2 font-medium">
              {permission === "granted" && (
                <span className="text-[var(--text-in)] flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Concedida
                </span>
              )}
              {permission === "denied" && (
                <span className="text-[var(--text-out)] flex items-center gap-1.5">
                  <AlertCircle className="size-4" /> Bloqueada no sistema
                </span>
              )}
              {permission === "default" && (
                <span className="text-[var(--text-warn)] flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> Pendente de autorização
                </span>
              )}
              {permission === "unsupported" && (
                <span className="text-[var(--text-muted)]">Indisponível</span>
              )}
            </div>
          </div>

          {/* Estado da Inscrição (Subscription) */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-1">
            <span className="text-xs text-[var(--text-muted)] block">Inscrição Push Local</span>
            <div className="flex items-center gap-2 font-medium">
              {subscription ? (
                <span className="text-[var(--text-in)] flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Inscrito para testes
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">Não inscrito</span>
              )}
            </div>
          </div>
        </div>

        {/* Alerta específico para iPhone */}
        {isStandalone === false && (
          <aside
            role="status"
            className="flex gap-3 rounded-xl border border-[var(--line-strong)] bg-[var(--warn-soft)] p-4 text-xs text-[var(--text)]"
          >
            <AlertTriangle className="size-5 shrink-0 text-[var(--text-warn)]" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">Atenção para usuários de iPhone (iOS 16.4+):</p>
              <p>
                O Safari da Apple exige que o aplicativo esteja <strong>adicionado à Tela de Início</strong> para permitir notificações push.
              </p>
              <p className="text-[var(--text-muted)]">
                Toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta para cima) na barra do Safari e selecione <strong>Adicionar à Tela de Início</strong>. Abra o app pelo ícone criado antes de ativar.
              </p>
            </div>
          </aside>
        )}
      </div>

      {/* Cartão de Ações */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text)] flex items-center gap-2">
          <Bell className="size-5 text-[var(--text-muted)]" />
          Ações de Teste
        </h2>

        {feedback && (
          <div
            role="alert"
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
              feedback.type === "success"
                ? "border-[var(--text-in)]/30 bg-[var(--in-soft)] text-[var(--text-in)]"
                : feedback.type === "error"
                ? "border-[var(--text-out)]/30 bg-[var(--out-soft)] text-[var(--text-out)]"
                : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="size-5 shrink-0" />
            ) : (
              <AlertCircle className="size-5 shrink-0" />
            )}
            <div className="flex-1">{feedback.message}</div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            disabled={isPending || permission === "denied" || Boolean(subscription)}
            onClick={handleSubscribe}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--acento)] px-5 font-semibold text-[var(--on-acento)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Bell className="size-4" />
            {subscription ? "Notificações Ativas" : isPending ? "Ativando..." : "1. Ativar notificações"}
          </button>

          <button
            type="button"
            disabled={isPending || !subscription}
            onClick={handleSendTest}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-5 font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
          >
            <Send className="size-4" />
            {isPending ? "Disparando..." : "2. Enviar notificação de teste"}
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] pt-1">
          Dica para teste no iPhone: ao clicar em <strong>Enviar notificação de teste</strong>, bloqueie a tela do aparelho imediatamente ou volte à tela inicial para que o banner apareça na central de notificações.
        </p>
      </div>
    </div>
  );
}
