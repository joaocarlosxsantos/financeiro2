"use client";

import { useActionState } from "react";
import { registerAction, type FormState } from "@/server/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

const initial: FormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);

  return (
    <form aria-busy={pending} action={formAction} className="space-y-4">
      <Field label="Nome">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="name" required placeholder="Como quer ser chamado" autoComplete="name" />
      </Field>
      <Field label="E-mail">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="email" type="email" required placeholder="voce@email.com" autoComplete="email" />
      </Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres.">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Sua senha" />
      </Field>
      <Field label="Confirmar senha">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="Sua senha" />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-[var(--color-money-out-soft)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--text-out)]">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="min-h-11 min-w-11 w-full" pendingLabel="Criando...">
        Criar conta
      </SubmitButton>
    </form>
  );
}
