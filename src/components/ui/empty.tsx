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
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
        <Icon className="size-5 opacity-60" />
      </div>
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      <p className="muted mx-auto mt-1 max-w-sm text-[0.8125rem] leading-relaxed">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
