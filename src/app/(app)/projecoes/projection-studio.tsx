"use client";

import { useMemo, useState } from "react";
import { MobileDisclosure } from "@/components/ui/mobile-disclosure";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, MoneyInput } from "@/components/ui/field";
import { Hint } from "@/components/ui/hint";
import { ProjectionChart, type ProjectionRow } from "@/components/charts/projection-chart";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { projectBalance } from "@/lib/finance";

const SCENARIOS = [
  { key: "conservador", name: "Conservador", rate: 6, color: "var(--text-brand)", desc: "Renda fixa pós-fixada em ano de juro baixo" },
  { key: "realista", name: "Realista", rate: 10, color: "var(--color-money-in)", desc: "Carteira equilibrada ao longo do tempo" },
  { key: "otimista", name: "Otimista", rate: 14, color: "var(--color-variable)", desc: "Cenário favorável, com mais risco envolvido" },
] as const;

const HORIZONS = [1, 3, 5, 10, 20];

export function ProjectionStudio({
  startCents,
  suggestedMonthlyCents,
}: {
  startCents: number;
  suggestedMonthlyCents: number;
}) {
  const [start, setStart] = useState(centsToInput(startCents));
  const [monthly, setMonthly] = useState(centsToInput(suggestedMonthlyCents));
  const [years, setYears] = useState(10);

  const startC = parseMoneyToCents(start);
  const monthlyC = parseMoneyToCents(monthly);
  const months = years * 12;

  const { rows, finals } = useMemo(() => {
    const label = (i: number) => (i === 0 ? "hoje" : i % 12 === 0 ? `${i / 12}a` : `${i}m`);
    const series = SCENARIOS.map((s) => ({
      ...s,
      points: projectBalance(startC, monthlyC, s.rate, months, label),
    }));

    const rows: ProjectionRow[] = [];
    for (let i = 0; i <= months; i++) {
      const row: ProjectionRow = { label: i % 12 === 0 ? `${i / 12} ano${i / 12 === 1 ? "" : "s"}` : "" };
      for (const s of series) row[s.key] = s.points[i].balanceCents;
      rows.push(row);
    }

    const finals = series.map((s) => ({
      key: s.key,
      name: s.name,
      rate: s.rate,
      color: s.color,
      desc: s.desc,
      finalCents: s.points[months].balanceCents,
    }));

    return { rows, finals };
  }, [startC, monthlyC, months]);

  const invested = startC + monthlyC * months;
  const realistic = finals[1].finalCents;
  const earnings = realistic - invested;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="order-2 min-w-0 space-y-4 lg:order-1">
        <Card className="min-w-0">
          <CardHeader title="Seus números" subtitle="Preenchemos com o que já sabemos sobre você." />
          <MobileDisclosure label="Ajustar valores e horizonte"><div className="space-y-4">
            <Field label="Quanto você já tem guardado">
              <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" value={start} onChange={(e) => setStart(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Quanto vai guardar por mês" hint="Sugerimos a sobra do seu mês atual.">
              <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Horizonte">
              <div className="flex flex-wrap gap-1.5">
                {HORIZONS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYears(y)}
                    className={["min-h-11 min-w-11", years === y
                        ? "h-9 cursor-pointer rounded-[var(--radius-button)] border border-[var(--acento)] bg-[var(--color-save-soft)] px-3 text-[0.8125rem] font-medium text-[var(--text-brand)]"
                        : "h-9 cursor-pointer rounded-[var(--radius-button)] border border-[var(--border)] px-3 text-[0.8125rem] font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"].filter(Boolean).join(" ")}
                  >
                    {y} ano{y === 1 ? "" : "s"}
                  </button>
                ))}
              </div>
            </Field>
          </div></MobileDisclosure>
        </Card>

        <Hint tone="tip" title="O que move o gráfico">
          Nos primeiros anos, quem manda é <strong>o quanto você aporta</strong>. Depois de uns 10
          anos, o juro sobre o juro passa a pesar mais que o aporte. Por isso começar cedo importa
          mais do que acertar o investimento perfeito.
        </Hint>
      </div>

      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <Card className="min-w-0">
          <CardHeader
            title={`Patrimônio projetado em ${years} ano${years === 1 ? "" : "s"}`}
            mobileTitle={`Patrimônio em ${years} anos`}
            subtitle="Três cenários de rentabilidade anual sobre os mesmos aportes."
          />
          <ProjectionChart
            data={rows}
            series={SCENARIOS.map((s) => ({ key: s.key, name: `${s.name} (${s.rate}% a.a.)`, color: s.color }))}
          />
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {finals.map((f) => (
            <Card className="min-w-0" key={f.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="size-2.5 rounded-[3px]" style={{ background: f.color }} />
                <p className="text-[0.8125rem] font-medium">{f.name}</p>
                <span className="muted ml-auto text-xs">{f.rate}% a.a.</span>
              </div>
              <p className="tnum break-all text-[clamp(1rem,2vw,1.25rem)] font-semibold tracking-tight">{formatCents(f.finalCents)}</p>
              <p className="muted mt-1 text-xs leading-snug">{f.desc}</p>
            </Card>
          ))}
        </div>

        <Card className="min-w-0 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
          <CardHeader title="Decompondo o cenário realista" subtitle="Quanto veio de você e quanto veio do juro." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label="Você depositou" value={formatCents(invested)} />
            <Metric label="Juros acumulados" value={formatCents(Math.max(0, earnings))} />
            <Metric
              label="Parte do total que é juro"
              value={realistic > 0 ? `${Math.round((Math.max(0, earnings) / realistic) * 100)}%` : "—"}
            />
          </div>
          <p className="muted mt-4 text-xs leading-relaxed">
            Projeção nominal, sem considerar inflação nem imposto de renda. Serve para comparar
            cenários e entender ordem de grandeza — não é promessa de rentabilidade.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-[var(--surface)] p-3 sm:p-3.5">
      <p className="muted text-xs">{label}</p>
      <p className="tnum break-all mt-0.5 text-[0.9375rem] font-semibold">{value}</p>
    </div>
  );
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
