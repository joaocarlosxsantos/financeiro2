"use client";

import { useActionState } from "react";
import { saveUsageProfile } from "@/server/actions/usage-profile";
import { UsageProfileFields } from "@/components/usage-profile-fields";
import { SubmitButton } from "@/components/ui/button";
import type { UsageProfile } from "@/lib/usage-profile";

export function UserProfileForm({ profile }: { profile: UsageProfile }) {
  const [state, action, pending] = useActionState(saveUsageProfile, {});
  return <form action={action} aria-busy={pending} className="space-y-5">
    <fieldset disabled={pending}><UsageProfileFields key={profile} defaultValue={profile} /></fieldset>
    <p className="text-sm text-[var(--text-muted)]">A mudança preserva suas contas e seu histórico. O modo de cada conta continua valendo.</p>
    {state.error && <p role="alert" className="text-sm text-[var(--text-out)]">{state.error}</p>}
    {state.ok && <p role="status" className="text-sm text-[var(--text-in)]">Perfil atualizado.</p>}
    <SubmitButton pendingLabel="Salvando…">Salvar perfil</SubmitButton>
  </form>;
}
