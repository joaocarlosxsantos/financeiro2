"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Sheet, useSheetClose } from "./sheet";
import { Button } from "./ui/button";
import { safeNotificationPath } from "./notification-links";

type Item = { id: string; title: string; body: string; actionUrl: string; critical: boolean; readAt: string | null; createdAt: string };
type Feed = { items: Item[]; unreadCount: number; hasMore: boolean };
export async function notificationRequest(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar. Tente novamente.");
  return result;
}
function changed() { window.dispatchEvent(new Event("notifications-changed")); }
export function NotificationsFeed({ compact = false }: { compact?: boolean }) {
  const router = useRouter(); const closeSheet = useSheetClose(); const [filter, setFilter] = useState("all"), [page, setPage] = useState(1);
  const [feed, setFeed] = useState<Feed | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try { setFeed(await notificationRequest(`/api/notifications?filter=${filter}&page=${page}`)); setError(""); } catch (e) { setError((e as Error).message); }
  }, [filter, page]);
  useEffect(() => { const start = setTimeout(() => void reload(), 0); const timer = setInterval(() => void reload(), 60000); return () => { clearTimeout(start); clearInterval(timer); }; }, [reload]);
  async function update(action: string, id?: string, url?: string) {
    setBusy(true); setError("");
    try {
      await notificationRequest("/api/notifications", { action, ...(id ? { id } : {}) });
      changed();
      await reload();
    } catch (e) {
      if (!url) setError((e as Error).message);
    } finally {
      setBusy(false);
      if (url) {
        closeSheet();
        router.push(safeNotificationPath(url, window.location.origin));
      }
    }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      {!compact && ([['all','Todas'],['unread','Não lidas'],['critical','Críticas']] as const).map(([value,label]) => <Button key={value} size="sm" variant={filter===value ? "primary" : "soft"} aria-pressed={filter===value} onClick={() => { setFilter(value); setPage(1); }}>{label}</Button>)}
      <Button size="sm" variant="ghost" disabled={busy || !feed?.unreadCount} onClick={() => void update("read_all")} className="text-[var(--text-muted)] hover:text-[var(--text)]">Marcar todas como lidas</Button>
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-out)]"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void reload()}>Tentar novamente</Button></div>}
    {!feed && !error && <p role="status">Carregando notificações…</p>}
    {feed?.items.length===0 && <div className="space-y-2 text-sm text-[var(--text-muted)]"><p>Nenhum aviso {filter === "unread" ? "não lido" : filter === "critical" ? "crítico" : "por aqui"}.</p><Link href="/notificacoes#preferencias" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]">Ver preferências de notificações</Link></div>}
    <ul className="divide-y divide-[var(--border)]">{feed?.items.slice(0,compact?10:20).map(item => <li key={item.id} className="flex items-start gap-2 py-3">
      <button disabled={busy} onClick={() => void update("read",item.id,item.actionUrl)} className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-1 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)] disabled:cursor-not-allowed disabled:opacity-50">
        <span className="flex items-center gap-2 font-medium">{!item.readAt && <span aria-label="Não lida" className="size-2 shrink-0 rounded-full bg-[var(--acento)]" />}{item.critical ? "Atenção" : item.title}</span>
        <span className="mt-1 block whitespace-pre-line break-words text-sm text-[var(--text-muted)]">{item.body}</span>
        <time className="mt-1 block text-xs text-[var(--text-muted)]" dateTime={item.createdAt}>{new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(new Date(item.createdAt))}</time>
      </button>
      <Button size="sm" variant="ghost" disabled={busy} aria-label="Dispensar notificação" onClick={() => void update("archive",item.id)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]">Dispensar</Button>
    </li>)}</ul>
    {!compact && feed && <div className="flex items-center justify-between gap-3"><Button size="sm" variant="soft" disabled={page===1} onClick={() => setPage(p=>p-1)}>Anterior</Button><span className="text-sm" aria-live="polite">Página {page}</span><Button size="sm" variant="soft" disabled={!feed.hasMore} onClick={() => setPage(p=>p+1)}>Próxima</Button></div>}
    {compact && <Link href="/notificacoes" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-medium transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)] active:bg-[var(--surface-3)]">Ver todas e configurar notificações</Link>}
  </div>;
}
export function NotificationBell({ mobileOnly = false }: { mobileOnly?: boolean }) {
  const [count,setCount]=useState(0),[open,setOpen]=useState(false);
  useEffect(()=>{ let active=true; const refresh=()=>notificationRequest("/api/notifications").then((data:Feed)=>{if(active)setCount(data.unreadCount);}).catch(()=>{});
    void refresh();const timer=setInterval(()=>void refresh(),60000);window.addEventListener("notifications-changed",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("notifications-changed",refresh);document.removeEventListener("visibilitychange",refresh);};},[]);
  return <><button type="button" onClick={()=>setOpen(true)} aria-label={`Notificações${count?`, ${count} não lidas`:""}`} className={`relative flex size-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] ${mobileOnly ? "lg:hidden" : "hidden lg:flex"}`}>
    <Bell aria-hidden="true" className="size-5"/>{count>0&&<span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--acento)] px-1 text-center text-xs text-[var(--on-acento)]">{count>9?"9+":count}</span>}
  </button>{open&&<Sheet title="Notificações" onClose={()=>setOpen(false)}><NotificationsFeed compact/></Sheet>}</>;
}
