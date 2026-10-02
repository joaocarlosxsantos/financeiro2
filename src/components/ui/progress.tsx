import { cn } from "@/lib/cn";

export function Progress({
  value,
  label,
  color = "var(--color-brand-600)",
  className,
  height = 4,
  ticks,
}: {
  value: number; // 0-100
  /** Nome acessível da barra. Sem ele o leitor de tela anuncia só o número. */
  label: string;
  color?: string;
  className?: string;
  height?: number;
  ticks?: number[];
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--border)]",
        className,
      )}
      style={{ height }}
      role="progressbar"
      aria-label={label}
      aria-valuetext={`${Math.round(v)}%`}
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full motion-reduce:transition-none transition-[width] duration-300"
        style={{ width: `${v}%`, background: color }}
      />
      {ticks?.map((t) => (
        <span
          key={t}
          className="absolute top-0 bottom-0 w-px bg-[var(--line)] pointer-events-none"
          style={{ left: `${Math.max(0, Math.min(100, t))}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
