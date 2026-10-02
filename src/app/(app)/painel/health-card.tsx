import type { HealthResult } from "@/lib/finance";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";

const LINKED_PART_LABEL = "Reserva de emergência";

const toneColor: Record<HealthResult["tone"], string> = {
  danger: "var(--color-money-out)",
  warn: "var(--color-variable)",
  ok: "var(--color-brand-500)",
  great: "var(--color-money-in)",
};

const toneText: Record<HealthResult["tone"], string> = {
  danger: "var(--text-out)",
  warn: "var(--text-warn)",
  ok: "var(--text-brand)",
  great: "var(--text-in)",
};

export function HealthCard({
  health,
  className,
}: {
  health: HealthResult;
  className?: string;
}) {
  const color = toneColor[health.tone];
  const textColor = toneText[health.tone];

  return (
    <section aria-label="Saúde financeira" className={cn("h-full", className)}>
      <div className="mb-4 flex items-baseline justify-between border-b border-[var(--line)] pb-2">
        <div>
          <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Saúde financeira
          </h2>
          <p className="text-xs font-medium" style={{ color: textColor }}>
            {health.label}
          </p>
        </div>
        <span
          className="tnum font-mono text-2xl font-semibold tracking-tight"
          style={{ color: textColor }}
        >
          {health.score}
        </span>
      </div>

      <ul className="space-y-3.5" role="list">
        {health.parts.map((part) => {
          const isReserve = part.label === LINKED_PART_LABEL;
          return (
            <li key={part.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                {isReserve ? (
                  <a
                    href="#reserva-emergencia"
                    className="font-medium text-[var(--text-brand)] hover:underline"
                  >
                    {part.label}
                  </a>
                ) : (
                  <span className="font-medium text-[var(--text)]">{part.label}</span>
                )}
                <span className="tnum font-mono text-[var(--text-muted)] text-[0.6875rem]">
                  {part.score}/{part.max}
                </span>
              </div>
              {isReserve ? (
                <p className="text-[0.6875rem] text-[var(--text-muted)] leading-snug">
                  {part.score} de {part.max} pts. Detalhes em{" "}
                  <a href="#reserva-emergencia" className="font-medium text-[var(--text-brand)] underline">
                    Reserva de emergência
                  </a>.
                </p>
              ) : (
                <>
                  <Progress
                    label={part.label}
                    value={(part.score / part.max) * 100}
                    color={color}
                    height={4}
                  />
                  <p className="mt-1 text-[0.6875rem] text-[var(--text-muted)] leading-snug">{part.hint}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
