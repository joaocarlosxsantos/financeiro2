import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Money } from "@/components/ui/money";

export function StatTile({
  label,
  cents,
  tone,
  icon: Icon,
  color,
  caption,
  className,
}: {
  label: string;
  cents: number;
  tone?: "in" | "out";
  icon: LucideIcon;
  color: string;
  caption?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("card p-5 border-l-[3px]", className)}
      style={{ borderLeftColor: color }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="muted text-[0.8125rem] font-medium">{label}</p>
        <Icon className="size-4 shrink-0 opacity-35" style={{ color }} />
      </div>
      <div className="tnum text-[1.75rem] leading-none font-bold tracking-tight">
        <Money cents={cents} tone={tone} size="lg" />
      </div>
      {caption ? <p className="muted mt-2 text-xs leading-snug">{caption}</p> : null}
    </div>
  );
}
