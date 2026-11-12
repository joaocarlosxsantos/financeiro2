"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

/** Inline confirmation also works inside the native dialog's top layer. */
export function LogoutButton() {
  const [confirming, setConfirming] = useState(false);
  async function logout() {
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        try { await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }); } catch { /* Local unsubscribe still prevents delivery. */ }
        await subscription.unsubscribe();
      }
    } finally { await logoutAction(); }
  }
  return <div className="mt-6 border-t border-[var(--line)] pt-4 pb-8">
    {confirming ? <div className="space-y-3" role="group" aria-label="Confirmar saída">
      <p className="px-3 text-sm">Sair da sua conta?</p>
      <div className="flex flex-wrap gap-2 px-3">
        <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button>
        <form action={logout}><Button type="submit">Sim, sair</Button></form>
      </div>
    </div> : <button type="button" onClick={() => setConfirming(true)} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]">
      <LogOut aria-hidden="true" className="size-5" />Sair
    </button>}
  </div>;
}
