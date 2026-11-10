import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Criar conta — Financeiro 2.0" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/painel");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="min-w-0 w-full max-w-sm">
        <Link href="/" className="inline-flex min-h-11 items-center mb-8 flex min-h-11 items-center justify-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-brand)]">
            <span className="font-display text-base font-bold leading-none">F</span>
          </div>
          <span className="font-display text-base font-medium tracking-tight text-[var(--text)]">
            Financeiro <span className="text-xs font-normal text-[var(--text-muted)]">2.0</span>
          </span>
        </Link>

        <div className="card p-5 sm:p-7">
          <h1 className="font-display text-display font-semibold tracking-tight">Criar conta</h1>
          <p className="muted mt-1 mb-6 text-sm">
            Categorias e contas iniciais prontas para uso.
          </p>
          <RegisterForm />
        </div>

        <p className="muted mt-6 text-center text-xs">
          Já tem conta?{" "}
          <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-[var(--text-brand)] hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
