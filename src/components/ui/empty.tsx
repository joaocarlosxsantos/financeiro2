import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  /** @deprecated A identidade W0 não usa ilustrações decorativas. */
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <h3 className="font-display text-heading font-semibold tracking-tight text-[var(--text)]">{title}</h3>
      <p className="muted mx-auto mt-1 max-w-sm text-sm leading-relaxed">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
