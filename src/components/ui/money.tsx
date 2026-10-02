import { cn } from "@/lib/cn";
import { formatCents, formatCentsParts } from "@/lib/money";

export interface MoneyProps {
  cents: number;
  tone?: "in" | "out";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_VARIANTS = {
  sm: "text-[0.8125rem]",
  md: "text-base",
  lg: "text-[1.75rem] leading-none tracking-tight",
};

export function Money({ cents, tone, size = "md", className }: MoneyProps) {
  const parts = formatCentsParts(cents);
  const isZero = (cents ?? 0) === 0 || Object.is(cents, -0);
  const isOut = !isZero && (parts.negative || tone === "out");

  const toneClass =
    tone === "in"
      ? "text-[var(--text-in)]"
      : isOut
        ? "text-[var(--text-out)]"
        : "";

  return (
    <span
      className={cn(
        "tnum inline-flex items-baseline font-mono",
        SIZE_VARIANTS[size],
        toneClass,
        className,
      )}
    >
      <span className="sr-only">
        {formatCents(isOut ? -Math.abs(cents) : cents)}
      </span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {isOut && <span className="mr-0.5 font-medium select-none">-</span>}
        <span className="mr-1 text-[0.65em] font-normal text-[var(--text-muted)] select-none">
          {parts.currency}
        </span>
        <span className="font-semibold">{parts.integer}</span>
        <span className="text-[0.6em] font-normal text-[var(--text-muted)]">
          {`${parts.decimal}${parts.fraction}`}
        </span>
      </span>
    </span>
  );
}
