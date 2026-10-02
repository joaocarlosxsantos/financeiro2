import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Criar conta — Financeiro 2.0" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/painel");

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-brand)]">
            <span className="font-display text-base font-bold leading-none">F</span>
          </div>
          <span className="font-display text-base font-medium tracking-tight text-[var(--text)]">
            Financeiro <span className="text-xs font-normal text-[var(--text-muted)]">2.0</span>
          </span>
        </Link>

        <div className="card p-7">
          <h1 className="font-display text-xl font-medium tracking-tight">Criar conta</h1>
          <p className="muted mt-1 mb-6 text-xs">
            Categorias e contas iniciais prontas para uso.
          </p>
          <RegisterForm />
        </div>

        <p className="muted mt-6 text-center text-xs">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-[var(--text-brand)] hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
