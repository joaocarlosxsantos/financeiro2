import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Financeiro 2.0" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sessao?: string }>;
}) {
  const { sessao } = await searchParams;
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
          <h1 className="font-display text-xl font-medium tracking-tight">Entrar</h1>
          <p className="muted mt-1 mb-6 text-xs">Acesse seu caderno de contas.</p>

          {sessao === "expirada" ? (
            <p className="mb-5 rounded-[4px] border border-amber-300/40 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-400/10 dark:text-amber-200">
              Sua sessão expirou neste banco. Entre novamente.
            </p>
          ) : null}

          <LoginForm />
        </div>

        <p className="muted mt-6 text-center text-xs">
          Não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
