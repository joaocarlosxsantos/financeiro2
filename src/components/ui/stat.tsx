import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";

export function StatTile({
  label,
  cents,
  icon: Icon,
  color,
  caption,
  className,
}: {
  label: string;
  cents: number;
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
      <p className="tnum text-[1.75rem] leading-none font-bold tracking-tight">
        {formatCents(cents)}
      </p>
      {caption ? <p className="muted mt-2 text-xs leading-snug">{caption}</p> : null}
    </div>
  );
}
