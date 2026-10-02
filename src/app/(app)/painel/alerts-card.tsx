import Link from "next/link";
import { TriangleAlert, Info } from "lucide-react";
import type { Alert } from "@/lib/alerts";
import { cn } from "@/lib/cn";

export function AlertsCard({ alerts, className }: { alerts: Alert[]; className?: string }) {
  if (!alerts.length) return null;

  return (
    <aside
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5",
        className,
      )}
      aria-label="Avisos importantes"
    >
      <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-1.5">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Avisos ({alerts.length})
        </h2>
      </div>
      <ul className="divide-y divide-[var(--line)]" role="list">
        {alerts.map((a) => {
          const Icon = a.tone === "warn" ? TriangleAlert : Info;
          return (
            <li key={a.id} className="flex items-center gap-3 py-2 first:pt-1 last:pb-0.5">
              <span
                className={
                  a.tone === "warn"
                    ? "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-warn-soft)] text-[var(--text-warn)]"
                    : "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-save-soft)] text-[var(--text-brand)]"
                }
                aria-hidden="true"
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <span className="font-medium text-[var(--text)]">{a.title}</span>
                <span className="text-[var(--text-muted)]"> · {a.description}</span>
              </div>
              <Link
                href={a.href}
                className="shrink-0 text-xs font-medium text-[var(--text-brand)] hover:underline"
              >
                {a.linkLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
