import { requireUserId } from "@/lib/auth";
import { getAccounts, getCategories } from "@/server/queries";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts as accountsTable, importBatches } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { ImportWizard } from "./import-wizard";
import { ImportHistory } from "./import-history";

export const metadata = { title: "Importar extrato — Financeiro 2.0" };

export default async function ImportPage() {
  const userId = await requireUserId();

  const [accounts, categories, history] = await Promise.all([
    getAccounts(userId),
    getCategories(userId),
    db
      .select({
        id: importBatches.id,
        fileName: importBatches.fileName,
        rowCount: importBatches.rowCount,
        savedRows: importBatches.savedRows,
        createdAt: importBatches.createdAt,
        accountName: accountsTable.name,
      })
      .from(importBatches)
      .innerJoin(accountsTable, eq(accountsTable.id, importBatches.accountId))
      .where(eq(importBatches.userId, userId))
      .orderBy(desc(importBatches.createdAt))
      .limit(8),
  ]);

  return (
    <>
      <PageHeader
        title="Importar extrato ou fatura"
        description="Suba o arquivo que o seu banco exporta. Nós lemos, sugerimos categoria linha a linha e bloqueamos o que já foi importado antes."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <ImportWizard
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind as "INCOME" | "EXPENSE",
            nature: c.nature as "FIXED" | "VARIABLE",
            color: c.color,
          }))}
        />

        <div className="space-y-4">
          <Card>
            <CardHeader title="Onde encontrar o arquivo" />
            <ul className="muted space-y-2.5 text-[0.8125rem] leading-relaxed">
              <li>
                <strong className="text-[var(--text)]">Nubank:</strong> extrato → exportar → CSV ou OFX.
                A fatura do cartão também sai em CSV.
              </li>
              <li>
                <strong className="text-[var(--text)]">Inter:</strong> extrato → período → exportar OFX.
              </li>
              <li>
                <strong className="text-[var(--text)]">Itaú / Bradesco / Santander:</strong> extrato →
                salvar em OFX (Money) ou CSV.
              </li>
              <li>
                <strong className="text-[var(--text)]">Outros:</strong> qualquer CSV com colunas de data,
                descrição e valor funciona.
              </li>
            </ul>
          </Card>

          <Hint tone="info" title="Fatura de cartão">
            Na fatura, os valores costumam vir positivos mesmo sendo gastos. Marque a opção{" "}
            <strong>&quot;inverter sinal&quot;</strong> se a prévia mostrar tudo como entrada.
          </Hint>

          {history.length ? (
            <Card>
              <CardHeader
                title="Importações recentes"
                subtitle="Importou algo errado? Apague o lote e importe de novo."
              />
              <ImportHistory
                batches={history.map((b) => ({
                  id: b.id,
                  fileName: b.fileName,
                  rowCount: b.rowCount,
                  savedRows: b.savedRows,
                  createdAt: b.createdAt.toISOString(),
                  accountName: b.accountName,
                }))}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
