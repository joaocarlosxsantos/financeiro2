"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { NotificationPreferences } from "@/server/notifications/policy";
import { notificationRequest } from "./notification-center";
import { Button } from "./ui/button";

type PreferenceKey = keyof NotificationPreferences;
const channelOptions: [PreferenceKey, string][] = [
  ["channelInApp", "Caixa de notificações no app"],
  ["channelPush", "Push nos dispositivos cadastrados"],
  ["channelTelegram", "Telegram"],
];
const topicOptions: [PreferenceKey, string][] = [
  ["dueBills", "Contas a pagar"], ["cardInvoice", "Cartões e faturas"],
  ["budget", "Orçamento"], ["negativeForecast", "Saldo e previsão"],
  ["spending", "Gastos e assinaturas"], ["summary", "Resumos"],
  ["goals", "Metas"], ["syncAlerts", "Problemas de sincronização"],
];
function applicationKey(value: string) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function supportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [linked, setLinked] = useState(false);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushSupported, setPushSupported] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await notificationRequest("/api/notifications/preferences");
      setPrefs(data.prefs);
      setLinked(data.telegramLinked);
    } catch (cause) {
      setError((cause as Error).message || "Não foi possível carregar as preferências.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPreferences();
      setPushSupported(supportsPush());
      setAppleMobile(isAppleMobile());
      if ("Notification" in window) setPermission(Notification.permission);
      else setPermission("unsupported");
    }, 0);
    if ("serviceWorker" in navigator && "PushManager" in window) {
      void navigator.serviceWorker.getRegistration()
        .then(registration => registration?.pushManager.getSubscription())
        .then(subscription => setSub(subscription ?? null))
        .catch(() => setError("Não foi possível consultar este dispositivo. Tente recarregar a página."));
    }
    return () => window.clearTimeout(timer);
  }, [loadPreferences]);

  async function save() {
    if (!prefs) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await notificationRequest("/api/notifications/preferences", prefs);
      setMessage("Preferências salvas.");
    } catch (cause) {
      setError((cause as Error).message || "Não foi possível salvar as preferências.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePush() {
    setMessage("");
    setError("");
    setBusy(true);
    try {
      if (sub) {
        await notificationRequest("/api/push/subscriptions", { endpoint: sub.endpoint }, "DELETE");
        await sub.unsubscribe();
        setSub(null);
        setMessage("Push removido deste dispositivo.");
        return;
      }
      if (!supportsPush()) throw new Error("Este navegador não oferece suporte a notificações push.");
      if (Notification.permission === "denied") throw new Error("A permissão está bloqueada. Altere-a nas configurações do navegador e tente novamente.");
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") throw new Error("Permissão não concedida. Você pode tentar novamente nas configurações do navegador.");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("A ativação de push está temporariamente indisponível.");
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(key) });
      let response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (response.status === 409) {
        await subscription.unsubscribe();
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(key) });
        response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      }
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error("Não foi possível cadastrar o dispositivo. Tente novamente.");
      }
      setSub(subscription);
      setMessage("Dispositivo cadastrado para push.");
      if (prefs && !prefs.channelPush) {
        const next = { ...prefs, channelPush: true };
        await notificationRequest("/api/notifications/preferences", next);
        setPrefs(next);
      }
    } catch (cause) {
      setError((cause as Error).message || "Não foi possível ativar push neste dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  function optionGroup(title: string, options: [PreferenceKey, string][]) {
    return <fieldset className="space-y-2">
      <legend className="mb-2 text-base font-semibold">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(([key, label]) => {
          const disabledReason = key === "channelTelegram" && !linked ? "Vincule o Telegram para alterar este canal." : "";
          return <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--surface-2)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--acento)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--acento)]" checked={Boolean(prefs?.[key])} disabled={busy || !prefs || Boolean(disabledReason)} onChange={event => prefs && setPrefs({ ...prefs, [key]: event.target.checked })} />
            <span>{label}{disabledReason && <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{disabledReason}</span>}</span>
          </label>;
        })}
      </div>
      {title === "Assuntos" && <p className="text-sm text-[var(--text-muted)]">Gastos e assinaturas compartilham a categoria Gastos.</p>}
      {title === "Canais" && !linked && <Link href="/configuracoes" className="inline-flex min-h-11 items-center rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]">Vincular o Telegram</Link>}
    </fieldset>;
  }

  const deviceStatus = !pushSupported ? "Este navegador não oferece suporte a push." : permission === "denied" ? "Permissão bloqueada nas configurações do navegador." : sub ? "Este dispositivo está cadastrado." : "Este dispositivo ainda não está cadastrado.";
  const pushStatus = prefs?.channelPush ? "O canal push global está ligado." : "O canal push global está desligado; nenhum dispositivo receberá avisos por push.";

  return <section id="preferencias" className="card space-y-5 p-4 sm:p-6" aria-label="Preferências de notificações">
    <div>
      <h2 className="text-lg font-semibold">Preferências de notificações</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Escolha os canais e assuntos dos avisos.</p>
    </div>
    <section aria-labelledby="device-push-heading" className="space-y-3 rounded-xl border border-[var(--border)] p-3 sm:p-4">
      <h3 id="device-push-heading" className="font-semibold">Push neste dispositivo</h3>
      <p className="text-sm text-[var(--text-muted)]" aria-live="polite">{deviceStatus} {pushStatus}</p>
      {appleMobile && <p className="text-sm text-[var(--text-muted)]">No iPhone ou iPad, primeiro use Compartilhar e escolha “Adicionar à Tela de Início”. Depois abra o app instalado e ative as notificações aqui.</p>}
      <Button variant={sub ? "outline" : "primary"} disabled={busy || !pushSupported || (!sub && permission === "denied")} aria-busy={busy} onClick={() => void togglePush()} className="w-full sm:w-auto">{sub ? "Remover push deste dispositivo" : "Ativar push neste dispositivo"}</Button>
      {permission === "denied" && <p className="text-sm text-[var(--text-muted)]">Para tentar novamente, permita notificações nas configurações do navegador.</p>}
    </section>
    {loading && <p role="status" className="text-sm text-[var(--text-muted)]">Carregando preferências…</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-out)]"><span>{error}</span><Button size="sm" variant="outline" disabled={loading} onClick={() => void loadPreferences()}>Tentar novamente</Button></div>}
    {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    {prefs && <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-5">
      {optionGroup("Canais", channelOptions)}
      {optionGroup("Assuntos", topicOptions)}
      <fieldset className="space-y-3">
        <legend className="mb-2 text-base font-semibold">Silêncio e privacidade</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--acento)]"><input type="checkbox" className="size-5 accent-[var(--acento)]" checked={prefs.discretePushMode} disabled={busy} onChange={event => setPrefs({ ...prefs, discretePushMode: event.target.checked })} /><span>Ocultar valores no push (modo discreto)</span></label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--acento)]"><input type="checkbox" className="size-5 accent-[var(--acento)]" checked={prefs.quietHoursEnabled} disabled={busy} onChange={event => setPrefs({ ...prefs, quietHoursEnabled: event.target.checked })} /><span>Silêncio para push e Telegram</span></label>
        <p className="text-sm text-[var(--text-muted)]">O silêncio apenas suprime avisos externos nesse período; não escolhe o horário de entrega nem cria uma fila para depois. Os avisos continuam na caixa do app.</p>
        <div className="flex flex-wrap gap-4">{([ ["quietStartHour", "Silêncio a partir de"], ["quietEndHour", "Voltar a avisar às"] ] as const).map(([key, label]) => <label key={key} className="space-y-1 text-sm"><span className="block">{label}</span><input type="number" min={0} max={23} required value={prefs[key]} disabled={busy || !prefs.quietHoursEnabled} onChange={event => setPrefs({ ...prefs, [key]: Number(event.target.value) })} className="min-h-11 w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)] disabled:opacity-60" /></label>)}</div>
        <p className="text-xs text-[var(--text-muted)]">Horários de São Paulo. Resumos controla os envios diário, semanal e mensal em conjunto.</p>
      </fieldset>
      <Button type="submit" disabled={busy} aria-busy={busy} className="w-full sm:w-auto">{busy ? "Aguarde…" : "Salvar preferências"}</Button>
    </form>}
  </section>;
}
