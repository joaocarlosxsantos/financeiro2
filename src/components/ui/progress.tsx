import { cn } from "@/lib/cn";

export function Progress({
  value,
  color = "var(--color-brand-500)",
  className,
  height = 8,
}: {
  value: number; // 0-100
  color?: string;
  className?: string;
  height?: number;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--border)]", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${v}%`, background: color }}
      />
    </div>
  );
}
