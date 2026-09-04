import Link from "next/link";
import { TriangleAlert, Info } from "lucide-react";
import type { Alert } from "@/lib/alerts";
import { Card, CardHeader } from "@/components/ui/card";

/**
 * Central de avisos: junta num só lugar o que hoje só aparecia se a pessoa
 * fosse conferir cada tela (orçamento estourado, meta que passou do prazo).
 * Só dentro do app por decisão explícita — sem e-mail nem notificação push.
 *
 * Recorrência pendente do mês já tem aviso próprio e acionável (o banner
 * "Lançar todas" logo no topo do Painel) — não duplicamos aqui.
 */
export function AlertsCard({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;

  return (
    <Card className="mb-4">
      <CardHeader
        title="Central de avisos"
        subtitle={`${alerts.length} coisa${alerts.length > 1 ? "s" : ""} que vale${alerts.length > 1 ? "m" : ""} sua atenção agora.`}
      />
      <ul className="space-y-3">
        {alerts.map((a) => {
          const Icon = a.tone === "warn" ? TriangleAlert : Info;
          return (
            <li key={a.id} className="flex items-start gap-3">
              <span
                className={
                  a.tone === "warn"
                    ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300"
                    : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/12 dark:text-brand-300"
                }
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-medium">{a.title}</p>
                <p className="muted mt-0.5 text-[0.8125rem] leading-relaxed">{a.description}</p>
              </div>
              <Link
                href={a.href}
                className="mt-0.5 shrink-0 text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                {a.linkLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
