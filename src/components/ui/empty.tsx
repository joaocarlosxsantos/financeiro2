import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-[var(--radius-card)] bg-[var(--surface-2)] border border-[var(--border)]">
        <Icon className="size-4.5 text-[var(--text-muted)]" />
      </div>
      <h3 className="font-display text-[1rem] font-semibold tracking-tight text-[var(--text)]">{title}</h3>
      <p className="muted mx-auto mt-1 max-w-sm text-xs leading-relaxed">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
