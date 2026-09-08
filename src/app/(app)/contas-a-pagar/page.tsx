import { Wallet } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getBillGroupings, getBillRulesStatus, getBillsForMonth } from "@/server/queries";
import { monthRefFromParam, monthLabel } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { BillsPendingBanner } from "./bills-pending-banner";
import { BillList } from "./bill-list";
import { NewBillForm } from "./new-bill-form";
import { BillRulesManager } from "./bill-rules-manager";
import { BillGroupingsManager } from "./bill-groupings-manager";

export const metadata = { title: "Contas a pagar — Financeiro 2.0" };

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const ref = monthRefFromParam(sp.m);

  const [groupings, rulesStatus, bills] = await Promise.all([
    getBillGroupings(userId),
    getBillRulesStatus(userId, ref),
    getBillsForMonth(userId, ref),
  ]);

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Anote suas contas do mês e administre a divisão de valores com quem mora ou assina algo junto com você. Fica separado dos Lançamentos — não mexe no Painel nem nos relatórios."
        action={<MonthSwitcher value={ref} />}
      />

      <BillsPendingBanner monthRef={ref} monthName={monthLabel(ref)} pending={rulesStatus.pending} />

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="p-0">
            {bills.length ? (
              <BillList bills={bills} monthLabel={monthLabel(ref)} groupings={groupings} />
            ) : (
              <EmptyState
                icon={Wallet}
                title={`Nada em ${monthLabel(ref)}`}
                description="Crie uma conta recorrente ou avulsa ao lado para começar a controlar."
              />
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <h2 className="mb-3 text-[0.9375rem] font-semibold tracking-tight">Nova conta</h2>
            <NewBillForm groupings={groupings} monthRef={ref} />
          </Card>

          <Card>
            <h2 className="mb-3 text-[0.9375rem] font-semibold tracking-tight">Contas recorrentes</h2>
            <BillRulesManager rules={rulesStatus.rules} monthRef={ref} />
          </Card>

          <Card>
            <h2 className="mb-3 text-[0.9375rem] font-semibold tracking-tight">Agrupamentos</h2>
            <BillGroupingsManager groupings={groupings} />
          </Card>
        </div>
      </div>
    </>
  );
}
