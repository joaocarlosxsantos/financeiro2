import { cn } from "@/lib/cn";
import { formatCents, formatCentsParts } from "@/lib/money";

export interface MoneyProps {
  cents: number;
  tone?: "in" | "out";
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
}

const SIZE_VARIANTS = {
  sm: "text-[0.8125rem]",
  md: "text-base",
  lg: "text-display leading-none tracking-tight",
  hero: "text-hero font-medium tracking-[-0.035em]",
};

export function Money({ cents, tone, size = "md", className }: MoneyProps) {
  const parts = formatCentsParts(cents);
  const isZero = (cents ?? 0) === 0 || Object.is(cents, -0);
  const isNegative = !isZero && (parts.negative || tone === "out");

  const toneClass =
    tone === "in"
      ? "text-[var(--text-in)]"
      : tone === "out"
        ? "text-[var(--text-out)]"
        : "";

  return (
    <span
      className={cn(
        "tnum mono inline-flex max-w-full items-baseline",
        SIZE_VARIANTS[size],
        toneClass,
        className,
      )}
    >
      <span className="sr-only">
        {isNegative ? `Menos ${formatCents(Math.abs(cents))}` : formatCents(cents)}
      </span>
      <span aria-hidden="true" className="inline-flex max-w-full flex-wrap items-baseline">
        {isNegative && <span className="mr-0.5 font-medium select-none">−</span>}
        <span className="mr-1 text-[0.5em] font-normal text-[var(--text-muted)] select-none">
          {parts.currency}
        </span>
        <span className="min-w-0 break-all font-semibold">{parts.integer}</span>
        <span className="text-[0.5em] font-normal text-[var(--text-muted)]">
          {`${parts.decimal}${parts.fraction}`}
        </span>
      </span>
    </span>
  );
}
