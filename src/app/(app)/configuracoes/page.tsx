import { MobileDisclosure } from "@/components/ui/mobile-disclosure";
import { requireUserId } from "@/lib/auth";
import { getAccountsWithStats, getCategories, getUser } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { AccountsPanel } from "./accounts-panel";
import { CategoriesPanel } from "./categories-panel";
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
        description="Ajuste a sua renda, as contas onde o dinheiro circula e as categorias que organizam os gastos."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Open Finance" subtitle="Conecte o Pluggy e escolha a fonte de cada conta." />
          <div className="p-4 pt-0"><Link className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--text-brand)] underline" href="/configuracoes/integracao">Configurar integração</Link></div>
        </Card>
        <Card className="min-w-0">
          <CardHeader
            title="Perfil financeiro"
            subtitle="Esses números alimentam a reserva de emergência, o 50/30/20 e a nota de saúde."
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
            <a
              href="/api/exportar/backup"
              download
              className="inline-flex items-center justify-center rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              Baixar backup (JSON)
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}
