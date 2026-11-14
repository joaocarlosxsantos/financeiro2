"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, MessageCircle, X } from "lucide-react";
import { SITE_CHAT_COMMANDS, floatingChatBottom, type ChatMessage } from "@/lib/site-chat";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import styles from "./site-chat.module.css";

export const SITE_CHAT_GREETING: ChatMessage = { id: 0, role: "assistant", text: "Olá! Escolha um comando para consultar suas contas." };

export function ChatTranscript({ messages, busy }: { messages: ChatMessage[]; busy: boolean }) {
  return <div role="log" aria-label="Conversa com o Mutano" aria-live="polite" aria-relevant="additions" aria-busy={busy} className="space-y-4">
    {messages.map(message => <div key={message.id} className={message.role === "user" ? "ml-8 text-right" : "mr-3"}>
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{message.role === "user" ? "Você" : "Mutano"}</span>
      <p className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-xl px-3 py-2.5 text-left text-sm leading-relaxed ${message.role === "user" ? "bg-[var(--acento)] text-[var(--on-acento)]" : "bg-[var(--surface-2)] text-[var(--text)]"}`}>{message.text}</p>
    </div>)}
  </div>;
}

export function ChatCommandMenu({ busy, onSelect }: { busy: boolean; onSelect: (command: string) => void }) {
  return <div id="site-chat-commands" role="group" className="grid grid-cols-2 gap-2 p-3" aria-label="Comandos disponíveis">
    {SITE_CHAT_COMMANDS.map(item => <Button key={item.command} type="button" variant="soft" disabled={busy}
      title={item.description} onClick={() => onSelect(item.command)} className="min-h-11 h-auto justify-start px-3 py-2 text-left text-sm">
      {item.label}
    </Button>)}
  </div>;
}

export function SiteChat() {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([SITE_CHAT_GREETING]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [bottom, setBottom] = useState<number>();
  const anchor = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  useEffect(() => {
    if (open) heading.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    // Respect existing navigation and the optional installation prompt, including dynamic height.
    const selector = 'nav[aria-label="Navegação principal mobile"], [aria-label="Instalar aplicativo"]';
    const resize = new ResizeObserver(update);
    function update() {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const obstacles = [...document.querySelectorAll(selector)].map(node => node.getBoundingClientRect());
      setBottom(floatingChatBottom(window.innerHeight, { left: rect.left, right: rect.left + 48 }, obstacles));
    }
    function observe() {
      resize.disconnect();
      document.querySelectorAll(selector).forEach(node => resize.observe(node));
      update();
    }
    const mutations = new MutationObserver(observe);
    mutations.observe(document.body, { childList: true, subtree: true });
    observe();
    window.addEventListener("resize", update);
    return () => { resize.disconnect(); mutations.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  async function select(command: string) {
    if (inFlight.current || signedOut) return;
    inFlight.current = true;
    if (command === "/pausar") {
      const accepted = await confirm({ title: "Pausar avisos do Telegram?", description: "As consultas continuam disponíveis. Para retomar os avisos, use Configurações.", confirmLabel: "Pausar avisos" });
      if (!accepted) { inFlight.current = false; return; }
    }
    setMenuOpen(false); setBusy(true); setError("");
    setMessages(old => [...old.slice(-19), { id: nextId.current++, role: "user", text: command }]);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/chat", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command }), signal: controller.signal });
      const result: unknown = await response.json();
      if (response.status === 401) { setMessages([]); setSignedOut(true); throw new Error("Sessão encerrada. Entre novamente para consultar."); }
      if (!response.ok) {
        throw new Error(response.status === 429 ? "Muitas consultas. Aguarde um minuto e escolha o comando novamente." : "Não foi possível consultar agora. Abra o menu e tente novamente.");
      }
      const reply = (result as { reply?: unknown })?.reply;
      if (typeof reply !== "string" || reply.length > 12_000) throw new Error("Resposta inválida. Tente novamente pelo menu.");
      setMessages(old => [...old.slice(-19), { id: nextId.current++, role: "assistant", text: reply }]);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível consultar. Tente novamente.");
      else setError("A consulta demorou demais. Abra o menu e tente novamente.");
    } finally {
      clearTimeout(timeout); setBusy(false); inFlight.current = false; request.current = null;
    }
  }

  return <div ref={anchor} className={styles.anchor} style={bottom === undefined ? undefined : { "--site-chat-bottom": `${bottom}px` } as CSSProperties}>
    <button ref={launcher} type="button" aria-label={open ? "Fechar chat de consultas" : "Abrir chat de consultas"} aria-expanded={open}
      aria-haspopup="dialog" aria-controls={open ? "site-chat-panel" : undefined} onClick={() => open ? close() : setOpen(true)}
      className={`${open ? "sr-only" : "flex"} size-12 cursor-pointer items-center justify-center rounded-full bg-[var(--acento)] text-[var(--on-acento)] shadow-md transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--acento)] motion-reduce:transition-none`}>
      <MessageCircle className="size-6" aria-hidden="true" strokeWidth={1.5} />
    </button>
    {open && <section id="site-chat-panel" role="dialog" aria-modal="false" aria-labelledby="site-chat-title"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}
      className={`${styles.panel} flex min-h-0 flex-col overflow-hidden rounded-2xl bg-[var(--surface)] text-[var(--text)]`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] p-3 pl-4">
        <div><h2 ref={heading} id="site-chat-title" tabIndex={-1} className="text-base font-semibold outline-none">Chat de consultas</h2>
          <p className="text-xs text-[var(--text-muted)]">Mutano Contas · menu do Telegram</p></div>
        <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Fechar chat"><X className="size-5" aria-hidden="true" /></Button>
      </header>
      <div ref={scroller} tabIndex={0} aria-label="Histórico de consultas" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 focus-visible:outline-2 focus-visible:outline-[var(--acento)]">
        <ChatTranscript messages={messages} busy={busy} />
        {busy && <p role="status" className="mt-3 text-sm text-[var(--text-muted)]">Consultando seus dados…</p>}
        {error && <p role="alert" className="mt-3 text-sm text-[var(--text-out)]">{error}</p>}
        {signedOut && <a href="/login" className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Entrar novamente</a>}
      </div>
      <div className="flex min-h-0 max-h-[55%] shrink-0 flex-col border-t border-[var(--line)]">
        <Button type="button" variant="ghost" aria-expanded={menuOpen} aria-controls="site-chat-commands" disabled={signedOut}
          onClick={() => setMenuOpen(value => !value)} className="min-h-11 w-full shrink-0 justify-between rounded-none px-4">
          Escolher comando <ChevronDown className={`size-4 ${menuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </Button>
        {menuOpen && <div className="min-h-0 overflow-y-auto overscroll-contain"><ChatCommandMenu busy={busy || signedOut} onSelect={command => void select(command)} /></div>}
      </div>
    </section>}
  </div>;
}
