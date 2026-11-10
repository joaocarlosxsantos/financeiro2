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
    <div id={id} className={cn("card min-w-0 p-3 sm:p-4 md:p-5", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
  mobileTitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  mobileTitle?: string;
}) {
  return (
    <div className={cn("mb-3 flex min-w-0 flex-wrap items-start sm:mb-4 justify-between gap-4", mobileTitle && "mb-2", className)}>
      <div className="min-w-0">
        <h2 className="break-words text-[clamp(1rem,2vw,var(--text-heading))] font-semibold text-[var(--text)] [overflow-wrap:anywhere]">{mobileTitle ? <><span className="sm:hidden">{mobileTitle}</span><span className="hidden sm:inline">{title}</span></> : title}</h2>
        {subtitle ? <p className={cn("muted mt-1 text-sm leading-snug", mobileTitle && "sr-only sm:not-sr-only sm:mt-1 sm:text-sm")}>{subtitle}</p> : null}
      </div>
      {action ? <div className="max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}

export function Section({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <header className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[clamp(1rem,2vw,var(--text-heading))] font-semibold text-[var(--text)]">{title}</h2>
          {subtitle ? <p className="muted mt-1 text-sm leading-snug">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="divide-y divide-[var(--line)]">{children}</div>
    </section>
  );
}
