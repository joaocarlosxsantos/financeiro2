import { Lightbulb, TriangleAlert, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const tones = {
  tip: { icon: Lightbulb, cls: "bg-[var(--warn-soft)] text-[var(--text-warn)]" },
  info: { icon: Info, cls: "bg-[var(--surface-2)] text-[var(--text-info)]" },
  warn: { icon: TriangleAlert, cls: "bg-[var(--warn-soft)] text-[var(--text-warn)]" },
  good: { icon: CheckCircle2, cls: "bg-[var(--in-soft)] text-[var(--text-in)]" },
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
    <div className={cn("flex gap-3 rounded-[var(--radius-md)] px-3.5 py-3 text-sm leading-relaxed", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
        <div className="[&_strong]:font-semibold">{children}</div>
      </div>
    </div>
  );
}
