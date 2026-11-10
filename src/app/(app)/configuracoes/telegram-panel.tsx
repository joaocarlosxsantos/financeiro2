"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createTelegramLink, disconnectTelegram, type TelegramState } from "@/server/actions/telegram";
import { TelegramPreferencesPanel } from "./telegram-preferences";

export function TelegramPanel() {
  const [state, setState] = useState<TelegramState>({});
  const [preferenceVersion, setPreferenceVersion] = useState(0);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<TelegramState>) {
    setState({});
    startTransition(async () => {
      try {
        const result = await action();
        setState(result);
        if (result.disconnected) setPreferenceVersion((value) => value + 1);
      }
      catch { setState({ error: "Não foi possível concluir. Entre no app novamente e tente outra vez." }); }
    });
  }

  return (
    <div className="space-y-3 p-4 pt-0">
      <p className="text-sm text-[var(--text-muted)]">Consulte seu saldo com /saldo em uma conversa privada. O link vale por 10 minutos e só pode ser usado uma vez. Não compartilhe.</p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => run(createTelegramLink)}>{pending ? "Aguarde..." : "Gerar link do Telegram"}</Button>
        <Button variant="outline" disabled={pending} onClick={() => run(disconnectTelegram)}>Desconectar Telegram</Button>
      </div>
      <div aria-live="polite" className="space-y-2 text-sm">
        {state.error && <p role="alert" className="text-[var(--text-out)]">{state.error}</p>}
        {state.disconnected && <p>Telegram desconectado e links pendentes cancelados.</p>}
        {state.url && <a className="inline-flex min-h-11 items-center text-[var(--text-brand)] underline" href={state.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir conversa e vincular Telegram</a>}
      </div>
      <TelegramPreferencesPanel key={preferenceVersion} />
    </div>
  );
}
