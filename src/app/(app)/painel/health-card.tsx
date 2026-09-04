import { Activity } from "lucide-react";
import type { HealthResult } from "@/lib/finance";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/**
 * A nota "Reserva de emergência" aqui é o mesmo runway/meta do card grande
 * "Reserva de emergência" mais abaixo na página, só que reescalado pra 0-35
 * pontos em vez de 0-100%. Mostrar duas barras de progresso quase idênticas
 * lado a lado confundia mais do que ajudava — por isso essa linha vira um
 * link pro card com os números completos em R$, em vez de repetir a barra.
 */
const LINKED_PART_LABEL = "Reserva de emergência";

/** Cor da barra (marca) e cor do texto (escurecida para 4.5:1). */
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

/** Nota de saúde financeira aberta em partes — o usuário vê de onde veio o número. */
export function HealthCard({ health }: { health: HealthResult }) {
  const color = toneColor[health.tone];
  const textColor = toneText[health.tone];

  return (
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <span
          className="flex size-9 items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            color: textColor,
          }}
        >
          <Activity className="size-4.5" />
        </span>
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Saúde financeira</h2>
          <p className="text-[0.8125rem] font-medium" style={{ color: textColor }}>
            {health.label}
          </p>
        </div>
        <span
          className="tnum ml-auto text-3xl font-semibold tracking-tight"
          style={{ color: textColor }}
        >
          {health.score}
        </span>
      </div>

      <ul className="space-y-4">
        {health.parts.map((part) => {
          const isReserve = part.label === LINKED_PART_LABEL;
          return (
            <li key={part.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                {isReserve ? (
                  <a
                    href="#reserva-emergencia"
                    className="text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {part.label}
                  </a>
                ) : (
                  <span className="text-[0.8125rem] font-medium">{part.label}</span>
                )}
                <span className="tnum muted text-xs">
                  {part.score}/{part.max}
                </span>
              </div>
              {isReserve ? (
                <p className="muted text-xs leading-snug">
                  Contribui {part.score} de {part.max} pontos pra nota. Progresso completo em R$ no
                  card{" "}
                  <a href="#reserva-emergencia" className="font-medium text-brand-600 underline dark:text-brand-300">
                    Reserva de emergência
                  </a>{" "}
                  abaixo.
                </p>
              ) : (
                <>
                  <Progress
                    label={part.label}
                    value={(part.score / part.max) * 100}
                    color={color}
                    height={6}
                  />
                  <p className="muted mt-1.5 text-xs leading-snug">{part.hint}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
