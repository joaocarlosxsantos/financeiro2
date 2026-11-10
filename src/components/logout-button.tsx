"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

/** Inline confirmation also works inside the native dialog's top layer. */
export function LogoutButton() {
  const [confirming, setConfirming] = useState(false);
  return <div className="mt-6 border-t border-[var(--line)] pt-4 pb-8">
    {confirming ? <div className="space-y-3" role="group" aria-label="Confirmar saída">
      <p className="px-3 text-sm">Sair da sua conta?</p>
      <div className="flex flex-wrap gap-2 px-3">
        <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button>
        <form action={logoutAction}><Button type="submit">Sim, sair</Button></form>
      </div>
    </div> : <button type="button" onClick={() => setConfirming(true)} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
      <LogOut aria-hidden="true" className="size-5" />Sair
    </button>}
  </div>;
}
