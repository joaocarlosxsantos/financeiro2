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
import { BillsTabs, type BillsTabType } from "./bills-tabs";

export const metadata = { title: "Contas a pagar — Financeiro 2.0" };

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; aba?: string }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const ref = monthRefFromParam(sp.m);
  const activeTab: BillsTabType = sp.aba === "compartilhadas" ? "compartilhadas" : "contas";

  const [groupings, rulesStatus, bills] = await Promise.all([
    getBillGroupings(userId),
    getBillRulesStatus(userId, ref),
    getBillsForMonth(userId, ref),
  ]);

  const individualCount = bills.filter((b) => b.type === "INDIVIDUAL").length;
  const sharedCount = bills.filter((b) => b.type === "GROUP").length;

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Controle de vencimentos e rateio de despesas do mês."
        action={<MonthSwitcher value={ref} />}
      />

      <BillsPendingBanner monthRef={ref} monthName={monthLabel(ref)} pending={rulesStatus.pending} />

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <BillsTabs
            activeTab={activeTab}
            monthParam={sp.m}
            individualCount={individualCount}
            sharedCount={sharedCount}
          />

          <div
            role="tabpanel"
            id={activeTab === "contas" ? "tabpanel-contas" : "tabpanel-compartilhadas"}
            aria-labelledby={activeTab === "contas" ? "tab-contas" : "tab-compartilhadas"}
          >
            <Card className="min-w-0 p-0">
              {bills.length ? (
                <BillList
                  bills={bills}
                  monthLabel={monthLabel(ref)}
                  groupings={groupings}
                  activeTab={activeTab}
                />
              ) : (
                <EmptyState
                  icon={Wallet}
                  title={`Nada em ${monthLabel(ref)}`}
                  description="Crie uma conta recorrente ou avulsa ao lado para começar a controlar."
                />
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="min-w-0">
            <h2 className="mb-3 text-[0.75rem] font-semibold tracking-normal text-[var(--text-muted)]">Nova conta</h2>
            <NewBillForm groupings={groupings} monthRef={ref} />
          </Card>

          <Card className="min-w-0">
            <h2 className="mb-3 text-[0.75rem] font-semibold tracking-normal text-[var(--text-muted)]">Contas recorrentes</h2>
            <BillRulesManager rules={rulesStatus.rules} monthRef={ref} />
          </Card>

          <Card className="min-w-0">
            <h2 className="mb-3 text-[0.75rem] font-semibold tracking-normal text-[var(--text-muted)]">Agrupamentos</h2>
            <BillGroupingsManager groupings={groupings} />
          </Card>
        </div>
      </div>
    </>
  );
}
