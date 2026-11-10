import { canUseCapability } from "@/lib/usage-profile";
import { MobileDisclosure } from "@/components/ui/mobile-disclosure";
import { requireUserId } from "@/lib/auth";
import { getAccountsWithStats, getCategories, getUser } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { AccountsPanel } from "./accounts-panel";
import { CategoriesPanel } from "./categories-panel";
import { TelegramPanel } from "./telegram-panel";
import { BackupButton } from "./backup-button";
import Link from "next/link";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, accounts, categories] = await Promise.all([
    getUser(userId),
    getAccountsWithStats(userId),
    getCategories(userId),
  ]);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Renda, contas e categorias."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Telegram" subtitle="Vincule seu chat privado ao Mutano Contas." />
          <TelegramPanel />
        </Card>
        {canUseCapability(user.usageProfile, "integration") && (<Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Open Finance" subtitle="Conecte o Pluggy e escolha a fonte de cada conta." />
          <div className="p-4 pt-0"><Link className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--text-brand)] underline" href="/configuracoes/integracao">Configurar integração</Link></div>
        </Card>)}
        <Card className="min-w-0">
          <CardHeader
            title="Perfil financeiro"
            subtitle="Renda e objetivos de economia."
          />
          <MobileDisclosure label="Editar perfil financeiro"><ProfileForm
            defaults={{
              name: user.name,
              income: user.monthlyIncomeCents,
              emergencyMonths: user.emergencyMonths,
              savingsTargetPct: user.savingsTargetPct,
            }}
          /></MobileDisclosure>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            title="Contas e cartões"
            subtitle="Gerencie suas contas financeiras."
          />
          <AccountsPanel
            accounts={accounts.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              color: a.color,
              institution: a.institution,
              archived: a.archived,
              transactionCount: a.transactionCount,
              recurringCount: a.recurringCount,
              closingDay: a.closingDay,
              dueDay: a.dueDay,
            }))}
          />
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Categorias"
            subtitle="As palavras-chave são o que faz a importação adivinhar a categoria certa. Separe por vírgula."
          />
          <CategoriesPanel
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              kind: c.kind as "INCOME" | "EXPENSE",
              nature: c.nature as "FIXED" | "VARIABLE",
              color: c.color,
              keywords: c.keywords,
            }))}
          />
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Dados"
            subtitle="Exporte um backup completo do seu perfil financeiro em JSON."
          />
          <div className="p-4">
            <BackupButton />
          </div>
        </Card>
      </div>
    </>
  );
}
