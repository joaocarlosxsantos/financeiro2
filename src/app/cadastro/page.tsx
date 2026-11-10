import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/painel");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="min-w-0 w-full max-w-sm">
        <Link href="/" aria-label="Razão" className="mb-8 flex min-h-11 items-center justify-center">
          <Logo className="justify-center" />
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
