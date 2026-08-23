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
    <div className={cn("card p-5", className)}>
      <div className="mb-3 flex items-center justify-between">
        <p className="muted text-[0.8125rem] font-medium">{label}</p>
        <span
          className="flex size-8 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="tnum text-2xl font-semibold tracking-tight">{formatCents(cents)}</p>
      {caption ? <p className="muted mt-1.5 text-xs leading-snug">{caption}</p> : null}
    </div>
  );
}
