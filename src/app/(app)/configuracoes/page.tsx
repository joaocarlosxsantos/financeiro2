import { requireUserId } from "@/lib/auth";
import { getAccountsWithStats, getCategories, getUser } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { AccountsPanel } from "./accounts-panel";
import { CategoriesPanel } from "./categories-panel";

export const metadata = { title: "Configurações — Financeiro 2.0" };

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
        description="Ajuste a sua renda, as contas onde o dinheiro circula e as categorias que organizam os gastos."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Perfil financeiro"
            subtitle="Esses números alimentam a reserva de emergência, o 50/30/20 e a nota de saúde."
          />
          <ProfileForm
            defaults={{
              name: user.name,
              income: user.monthlyIncomeCents,
              emergencyMonths: user.emergencyMonths,
              savingsTargetPct: user.savingsTargetPct,
            }}
          />
        </Card>

        <Card>
          <CardHeader
            title="Contas e cartões"
            subtitle="Cada lançamento pertence a uma conta. Isso mantém as importações separadas."
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
            }))}
          />
        </Card>

        <Card className="lg:col-span-2">
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
      </div>
    </>
  );
}
