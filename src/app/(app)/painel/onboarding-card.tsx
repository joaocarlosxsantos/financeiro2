import { canUseCapability, type UsageProfile } from "@/lib/usage-profile";
import Link from "next/link";
import { Check } from "lucide-react";
import type { OnboardingChecklist } from "@/server/queries";
import { cn } from "@/lib/cn";

export function OnboardingCard({
  checklist,
  profile,
  className,
}: {
  checklist: OnboardingChecklist;
  profile: UsageProfile;
  className?: string;
}) {
  if (checklist.hasAccount && checklist.hasTransaction) return null;

  const manualEntry = canUseCapability(profile, "manual-entry");
  const steps = [
    {
      done: checklist.hasAccount,
      title: manualEntry ? "Cadastre uma conta" : "Conecte suas contas",
      href: manualEntry ? "/contas" : "/configuracoes/integracao",
      linkLabel: manualEntry ? "Cadastrar conta" : "Conectar",
    },
    {
      done: checklist.hasTransaction,
      title: manualEntry ? "Registre suas movimenta\u00e7\u00f5es" : "Sincronize suas movimenta\u00e7\u00f5es",
      href: manualEntry ? "/lancamentos" : "/configuracoes/integracao",
      linkLabel: manualEntry ? "Ver lançamentos" : "Sincronizar",

    },
  ];

  return (
    <aside
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5",
        className,
      )}
      aria-label="Primeiros passos"
    >
      <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-1.5">
        <h2 className="text-xs font-semibold tracking-normal text-[var(--text-muted)]">
          Primeiros passos
        </h2>
      </div>
      <ol className="divide-y divide-[var(--line)]" role="list">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3 py-2 first:pt-1 last:pb-0.5">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                s.done
                  ? "bg-[var(--color-money-in-soft)] text-[var(--text-in)]"
                  : "bg-[var(--color-save-soft)] text-[var(--text-brand)]",
              )}
              aria-hidden="true"
            >
              {s.done ? <Check className="size-3" /> : i + 1}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 text-xs",
                s.done ? "text-[var(--text-muted)] line-through" : "font-medium text-[var(--text)]",
              )}
            >
              {s.title}
            </span>
            {!s.done ? (
              <Link
                href={s.href}
                className="inline-flex min-h-11 items-center shrink-0 text-xs font-medium text-[var(--text-brand)] hover:underline"
              >
                {s.linkLabel}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </aside>
  );
}
