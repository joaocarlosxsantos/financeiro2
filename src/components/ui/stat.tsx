import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Money } from "@/components/ui/money";
import type { ReactNode } from "react";

export function StatTile({
  label,
  cents,
  tone,
  caption,
  className,
  hero = false,
  sparkline,
}: {
  label: string;
  cents: number;
  tone?: "in" | "out";
  /** @deprecated Ícones decorativos não fazem mais parte dos blocos contábeis. */
  icon?: LucideIcon;
  /** @deprecated Use apenas cores semânticas de dinheiro/estado. */
  color?: string;
  caption?: string;
  className?: string;
  hero?: boolean;
  sparkline?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-medium text-[var(--text-muted)]">{label}</p>
          <div className="mt-1">
            <Money cents={cents} tone={tone} size={hero ? "hero" : "lg"} />
          </div>
        </div>
        {sparkline ? <div className="shrink-0" aria-hidden="true">{sparkline}</div> : null}
      </div>
      {caption ? <p className="muted mt-2 text-sm leading-snug">{caption}</p> : null}
    </div>
  );
}
