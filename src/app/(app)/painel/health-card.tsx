import { Activity } from "lucide-react";
import type { HealthResult } from "@/lib/finance";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const toneColor: Record<HealthResult["tone"], string> = {
  danger: "#f43f5e",
  warn: "#d95926",
  ok: "#6366f1",
  great: "#0d9488",
};

/** Nota de saúde financeira aberta em partes — o usuário vê de onde veio o número. */
export function HealthCard({ health }: { health: HealthResult }) {
  const color = toneColor[health.tone];

  return (
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <span
          className="flex size-9 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          <Activity className="size-4.5" />
        </span>
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Saúde financeira</h2>
          <p className="text-[0.8125rem] font-medium" style={{ color }}>
            {health.label}
          </p>
        </div>
        <span className="tnum ml-auto text-3xl font-semibold tracking-tight" style={{ color }}>
          {health.score}
        </span>
      </div>

      <ul className="space-y-4">
        {health.parts.map((part) => (
          <li key={part.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[0.8125rem] font-medium">{part.label}</span>
              <span className="tnum muted text-xs">
                {part.score}/{part.max}
              </span>
            </div>
            <Progress value={(part.score / part.max) * 100} color={color} height={6} />
            <p className="muted mt-1.5 text-xs leading-snug">{part.hint}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
