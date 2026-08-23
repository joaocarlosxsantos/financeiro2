import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartPie } from "lucide-react";
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
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ChartPie className="size-4.5" />
          </div>
          <span className="text-[0.9375rem] font-semibold tracking-tight">Financeiro 2.0</span>
        </Link>

        <div className="card p-7">
          <h1 className="text-xl font-semibold tracking-tight">Criar sua conta</h1>
          <p className="muted mt-1 mb-6 text-[0.8125rem]">
            Leva um minuto. Já deixamos categorias e contas prontas para você.
          </p>
          <RegisterForm />
        </div>

        <p className="muted mt-6 text-center text-[0.8125rem]">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
