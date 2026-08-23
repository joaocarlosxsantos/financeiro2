import { Lightbulb, TriangleAlert, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const tones = {
  tip: { icon: Lightbulb, cls: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:border-amber-400/20" },
  info: { icon: Info, cls: "bg-brand-50 text-brand-800 border-brand-200 dark:bg-brand-500/10 dark:text-brand-200 dark:border-brand-400/20" },
  warn: { icon: TriangleAlert, cls: "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-400/20" },
  good: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-400/20" },
} as const;

/** Caixa didática — explica o "porquê" de cada número, não só o número. */
export function Hint({
  tone = "tip",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, cls } = tones[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-3.5 py-3 text-[0.8125rem] leading-relaxed", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
        <div className="[&_strong]:font-semibold">{children}</div>
      </div>
    </div>
  );
}
