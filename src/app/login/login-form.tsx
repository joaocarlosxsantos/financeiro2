"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/server/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

const initial: FormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form aria-busy={pending} action={formAction} className="space-y-4">
      <Field label="E-mail">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
      </Field>
      <Field label="Senha">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="password" type="password" autoComplete="current-password" required placeholder="Sua senha" />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-[var(--color-money-out-soft)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--text-out)]">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="min-h-11 min-w-11 w-full" pendingLabel="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  );
}
