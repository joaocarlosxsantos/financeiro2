"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/server/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

const initial: FormState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
      </Field>

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  );
}
