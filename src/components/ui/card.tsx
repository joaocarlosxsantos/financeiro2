import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Card({
  className,
  children,
  id,
}: {
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className={cn("card p-5", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4 border-b border-[var(--line)] pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h2>
        {subtitle ? <p className="muted mt-1 text-[0.8125rem] leading-snug normal-case tracking-normal">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
