import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartPie } from "lucide-react";
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
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ChartPie className="size-4.5" />
          </div>
          <span className="text-[0.9375rem] font-semibold tracking-tight">Financeiro 2.0</span>
        </Link>

        <div className="card p-7">
          <h1 className="text-xl font-semibold tracking-tight">Bem-vindo de volta</h1>
          <p className="muted mt-1 mb-6 text-[0.8125rem]">Entre para ver o seu painel.</p>

          {sessao === "expirada" ? (
            <p className="mb-5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[0.8125rem] text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
              Sua sessão não vale mais neste banco de dados. Entre de novo.
            </p>
          ) : null}

          <LoginForm />
        </div>

        <p className="muted mt-6 text-center text-[0.8125rem]">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
}
