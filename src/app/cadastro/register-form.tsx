"use client";

import { useActionState } from "react";
import { registerAction, type FormState } from "@/server/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

const initial: FormState = {};

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nome">
        <Input name="name" required placeholder="Como quer ser chamado" autoComplete="name" />
      </Field>
      <Field label="E-mail">
        <Input name="email" type="email" required placeholder="voce@email.com" autoComplete="email" />
      </Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres.">
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Confirmar senha">
        <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </Field>

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Criando...">
        Criar conta
      </SubmitButton>
    </form>
  );
}
