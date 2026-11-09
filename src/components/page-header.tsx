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
    <div className="mb-6 flex min-w-0 flex-col items-start justify-between gap-4 md:flex-row md:flex-wrap md:items-end">
      <div className="min-w-0 max-w-full">
        <h1 className="font-display text-display font-semibold tracking-tight break-words text-[var(--text)]">{title}</h1>
        {description ? (
          <p className="muted mt-1 text-sm font-normal leading-normal">{description}</p>
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
