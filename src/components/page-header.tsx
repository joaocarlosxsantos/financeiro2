import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border)] pb-3">
      <div>
        <h1 className="font-display text-2xl font-normal tracking-tight text-[var(--text)]">{title}</h1>
        {description ? (
          <p className="muted mt-0.5 text-xs font-normal leading-normal">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          {action}
        </div>
      ) : null}
    </div>
  );
}
