import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sessao?: string }>;
}) {
  const { sessao } = await searchParams;
  const session = await auth();
  if (session?.user) redirect("/painel");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="min-w-0 w-full max-w-sm">
        <Link href="/" aria-label="Razão" className="mb-8 flex min-h-11 items-center justify-center">
          <Logo className="justify-center" />
        </Link>

        <div className="card p-5 sm:p-7">
          <h1 className="font-display text-display font-semibold tracking-tight">Entrar</h1>
          <p className="muted mt-1 mb-6 text-sm">Acesse seu caderno de contas.</p>

          {sessao === "expirada" ? (
            <p className="mb-5 rounded-[4px] border border-[var(--border-warn)] bg-[var(--color-warn-soft)] px-3.5 py-2.5 text-xs text-[var(--text-warn)]">
              Sua sessão expirou neste banco. Entre novamente.
            </p>
          ) : null}

          <LoginForm />
        </div>

        <p className="muted mt-6 text-center text-xs">
          Não tem conta?{" "}
          <Link href="/cadastro" className="inline-flex min-h-11 items-center font-medium text-[var(--text-brand)] hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
