import Link from "next/link";
import { Check } from "lucide-react";
import type { OnboardingChecklist } from "@/server/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Roteiro guiado pós-onboarding: a calibragem de renda/metas em /onboarding
 * cobre "passo 1 de 1" dela, mas o app ainda fica vazio até a pessoa criar
 * uma conta e lançar algo — os dois passos que faltavam ficar visíveis.
 * Some sozinho assim que os dois estiverem feitos; some é a única "ação".
 */
export function OnboardingCard({ checklist }: { checklist: OnboardingChecklist }) {
  if (checklist.hasAccount && checklist.hasTransaction) return null;

  const steps = [
    {
      done: checklist.hasAccount,
      title: "Cadastre uma conta e o saldo que você tem hoje",
      description: "Conta corrente, poupança, cartão de crédito — o que você usa no dia a dia.",
      href: "/contas",
      linkLabel: "Cadastrar conta",
    },
    {
      done: checklist.hasTransaction,
      title: "Lance ou importe seus primeiros lançamentos",
      description: "Um mês de dados já é suficiente para o painel começar a fazer sentido.",
      href: "/importar",
      linkLabel: "Importar extrato",
    },
  ];

  return (
    <Card className="mb-4">
      <CardHeader title="Primeiros passos" subtitle="Duas coisas para o painel deixar de estar vazio." />
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold",
                s.done
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300"
                  : "bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300",
              )}
            >
              {s.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[0.875rem] font-medium", s.done && "muted line-through")}>{s.title}</p>
              <p className="muted mt-0.5 text-[0.8125rem] leading-relaxed">{s.description}</p>
            </div>
            {!s.done ? (
              <Link
                href={s.href}
                className="mt-0.5 shrink-0 text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                {s.linkLabel}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
