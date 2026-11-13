"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { NotificationPreferences } from "@/server/notifications/policy";
import { notificationRequest } from "./notification-center";
import { Button } from "./ui/button";
const labels: [keyof NotificationPreferences,string][] = [["channelInApp","No app"],["channelPush","Push nos dispositivos cadastrados"],["channelTelegram","Telegram"],["dueBills","Contas a pagar"],["cardInvoice","Cartões e faturas"],["budget","Orçamento"],["negativeForecast","Saldo e previsão"],["spending","Gastos e assinaturas"],["summary","Resumos"],["goals","Metas"],["syncAlerts","Problemas de sincronização"],["discretePushMode","Modo discreto: ocultar valores no push"],["quietHoursEnabled","Silêncio para push e Telegram"]];
function applicationKey(value:string){const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/"));const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
export function NotificationSettings(){
  const [prefs,setPrefs]=useState<NotificationPreferences|null>(null),[linked,setLinked]=useState(false),[sub,setSub]=useState<PushSubscription|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{void notificationRequest("/api/notifications/preferences").then(data=>{setPrefs(data.prefs);setLinked(data.telegramLinked);}).catch(e=>setMessage(e.message));
    if("serviceWorker"in navigator)void navigator.serviceWorker.getRegistration().then(r=>r?.pushManager?.getSubscription()).then(s=>setSub(s??null)).catch(()=>{});},[]);
  async function save(){if(!prefs)return;setBusy(true);try{await notificationRequest("/api/notifications/preferences",prefs);setMessage("Preferências salvas.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function togglePush(){
    setMessage("");setBusy(true);
    try{
      if(sub){await notificationRequest("/api/push/subscriptions",{endpoint:sub.endpoint},"DELETE");await sub.unsubscribe();setSub(null);setMessage("Push desativado neste dispositivo.");return;}
      if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window))throw new Error("Este navegador não suporta push. No iPhone, adicione o app à Tela de Início.");
      const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Permita notificações nas configurações do navegador para ativar.");
      const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;if(!key)throw new Error("Push temporariamente indisponível.");
      await navigator.serviceWorker.register("/sw.js");const reg=await navigator.serviceWorker.ready;
      let subscription=await reg.pushManager.getSubscription()??await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});
      let response=await fetch("/api/push/subscriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(subscription.toJSON())});
      if(response.status===409){await subscription.unsubscribe();subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});response=await fetch("/api/push/subscriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(subscription.toJSON())});}
      if(!response.ok){await subscription.unsubscribe();throw new Error("Não foi possível cadastrar o dispositivo. Tente novamente.");}
      setSub(subscription);setMessage("Push ativado neste dispositivo.");
      if(prefs&&!prefs.channelPush){const next={...prefs,channelPush:true};await notificationRequest("/api/notifications/preferences",next);setPrefs(next);}
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="card space-y-4 p-4 sm:p-6" aria-label="Preferências de notificações">
    <h2 className="text-lg font-semibold">Como você quer receber</h2>
    <Button variant={sub?"outline":"primary"} disabled={busy} aria-busy={busy} onClick={()=>void togglePush()} className="w-full sm:w-auto">{sub?"Desativar push neste dispositivo":"Ativar push neste dispositivo"}</Button>
    <p className="text-sm text-[var(--text-muted)]">No iPhone, instale o app na Tela de Início. Outros dispositivos cadastrados continuam ativos ao desativar este.</p>
    {message&&<p role="status" className="text-sm">{message}</p>}
    {prefs&&<form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">{labels.map(([key,label])=><label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--surface-2)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--acento)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"><input type="checkbox" className="size-5 shrink-0 accent-[var(--acento)]" checked={Boolean(prefs[key])} disabled={busy||(key==="channelTelegram"&&!linked)} onChange={e=>setPrefs({...prefs,[key]:e.target.checked})}/>{label}</label>)}</div>
      {!linked&&<Link href="/configuracoes" className="inline-flex min-h-11 items-center rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]">Vincular o Telegram</Link>}
      <div className="flex flex-wrap gap-4">{([['quietStartHour','Silêncio a partir de'],['quietEndHour','Voltar a avisar às']]as const).map(([key,label])=><label key={key} className="space-y-1 text-sm"><span className="block">{label}</span><input type="number" min={0} max={23} required value={prefs[key]} onChange={e=>setPrefs({...prefs,[key]:Number(e.target.value)})} className="min-h-11 w-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]"/></label>)}</div>
      <p className="text-xs text-[var(--text-muted)]">Horários de São Paulo. Durante o silêncio, os avisos continuam na caixa do app.</p>
      <Button type="submit" disabled={busy} aria-busy={busy} className="w-full sm:w-auto">{busy?"Aguarde…":"Salvar preferências"}</Button>
    </form>}
  </section>;
}
