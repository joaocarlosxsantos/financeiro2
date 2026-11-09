"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw, X } from "lucide-react";
import { Button, SubmitButton } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { Field, Input, Select } from "@/components/ui/field";
import {
  deleteAllOpenFinanceData,
  discoverOpenFinanceAccounts,
  getOpenFinanceDeletionCounts,
  linkOpenFinanceAccount,
  removeOpenFinanceConnection,
  removeOpenFinanceCredentials,
  saveOpenFinanceSetup,
  syncOpenFinance,
} from "@/server/actions/open-finance";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Setup = Awaited<ReturnType<typeof import("@/server/actions/open-finance").getOpenFinanceSetup>>;
type Remote = { id: string; name: string; type: "BANK" | "CREDIT"; currency: string };
type SyncAccountSummary = { accountName: string; accountType: string; read: number; ignoredByDate: number; ignoredByTombstone: number; ignoredByType: number; invalid: number; inserted: number; updated: number; status: string; error?: string };

export function IntegrationPanel({ initial }: { initial: Setup }) {
  const router = useRouter();
  const confirm = useConfirm();
  const modalTitleId = useId();

  const [setup, setSetup] = useState(initial);
  const [connectionId, setConnectionId] = useState(initial.connections[0]?.id ?? "");
  const [remote, setRemote] = useState<Remote[]>([]);
  const [remoteSelection, setRemoteSelection] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [syncSummary, setSyncSummary] = useState<{ status: string; imported: number; error?: string; accounts: SyncAccountSummary[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [fromDate, setFromDate] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- The mount flag gates createPortal so the server render does not access the browser DOM.
    setMounted(true);
  }, []);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- Apply refreshed server setup props and repair a connection selection that no longer exists.
    setSetup(initial);
    if (!initial.connections.some((c) => c.id === connectionId)) {
      setConnectionId(initial.connections[0]?.id ?? "");
      setRemote([]);
    }
  }, [initial, connectionId]);

  useEffect(() => {
    if (!isNewModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsNewModalOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isNewModalOpen]);

  const activeConnection = setup.connections.find((c) => c.id === connectionId) ?? setup.connections[0];

  async function save(form: FormData) {
    setBusy(true);
    setMessage("");
    const result = await saveOpenFinanceSetup({
      clientId: String(form.get("clientId") ?? ""),
      clientSecret: String(form.get("clientSecret") ?? ""),
      itemId: String(form.get("itemId") ?? ""),
      label: String(form.get("label") ?? ""),
      importFromDate: fromDate,
    });
    setBusy(false);
    if (result.error) {
      return setMessage(result.error);
    }

    const inputs = document.querySelectorAll<HTMLInputElement>('input[name="clientId"], input[name="clientSecret"], input[name="itemId"], input[name="label"]');
    inputs.forEach((input) => {
      input.value = "";
    });

    setIsNewModalOpen(false);
    setMessage("Conexão salva com sucesso. Os campos de credenciais foram limpos.");
    router.refresh();
  }

  async function loadAccounts() {
    if (!activeConnection?.id) return;
    setBusy(true);
    const result = await discoverOpenFinanceAccounts(activeConnection.id);
    setBusy(false);
    if (result.error) setMessage(result.error);
    else { setRemote(result.accounts ?? []); setRemoteSelection({}); }
  }

  async function readDeletionCounts(id: string) {
    setBusy(true);
    const result = await getOpenFinanceDeletionCounts({ connectionId: id });
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return null;
    }
    return result;
  }

  async function deleteAll(c: Setup["connections"][number]) {
    const counts = await readDeletionCounts(c.id);
    if (!counts) return;

    const ok = await confirm({
      title: `Excluir dados importados da Pluggy de "${c.label || "esta conexão"}"?`,
      description: `Serão apagados ${counts.transactions} lançamentos importados via Open Finance, ${counts.invoices} faturas e ${counts.tombstones} bloqueios. Lançamentos manuais e arquivos CSV/OFX continuam intactos.`,
      confirmLabel: "Excluir dados importados da Pluggy",
      tone: "danger",
    });
    if (!ok) return;

    setBusy(true);
    const result = await deleteAllOpenFinanceData({ connectionId: c.id, confirmation: "EXCLUIR DADOS PLUGGY" });
    setBusy(false);

    if (!("transactions" in result)) {
      setMessage(result.error);
      return;
    }

    setMessage(`${result.transactions} lançamento(s), ${result.invoices} fatura(s) e ${result.tombstones} bloqueio(s) excluídos com sucesso.`);
    router.refresh();
  }

  async function removeConnection(c: Setup["connections"][number], deleteImported: boolean) {
    const counts = await readDeletionCounts(c.id);
    if (!counts) return;

    const description = deleteImported
      ? `A conexão "${c.label || "sem nome"}" será removida e serão apagados ${counts.transactions} lançamentos importados via Open Finance, ${counts.invoices} faturas e ${counts.tombstones} bloqueios. Lançamentos manuais e arquivos CSV/OFX continuam intactos. As contas locais voltarão ao modo manual.`
      : `A conexão "${c.label || "sem nome"}" será desvinculada, mas ${counts.transactions} lançamentos importados via Open Finance serão mantidos no seu histórico. ${counts.invoices} faturas e o vínculo da conexão serão removidos. Bloqueios de reimportação continuarão ativos. As contas locais voltarão ao modo manual. Lançamentos manuais e arquivos CSV/OFX continuam intactos.`;

    const ok = await confirm({
      title: deleteImported
        ? `Remover conexão e excluir lançamentos Pluggy?`
        : `Remover conexão e manter lançamentos?`,
      description,
      confirmLabel: deleteImported ? "Remover conexão e excluir lançamentos Pluggy" : "Remover conexão e manter lançamentos",
      tone: "danger",
    });
    if (!ok) return;

    setBusy(true);
    const result = await removeOpenFinanceConnection({
      connectionId: c.id,
      confirmation: "REMOVER CONEXAO",
      deleteImported,
    });
    setBusy(false);

    if (!("deletedTransactions" in result)) {
      setMessage(result.error);
      return;
    }

    setMessage(
      deleteImported
        ? `Conexão removida com sucesso e ${result.deletedTransactions} lançamento(s) apagados.`
        : "Conexão removida com sucesso. Os lançamentos importados foram preservados no histórico.",
    );
    router.refresh();
  }

  async function removeCredentials() {
    const ok = await confirm({
      title: "Remover as credenciais Pluggy?",
      description: "O Client ID e o Client Secret cifrados serão apagados. Esta ação só é permitida quando não há conexões cadastradas.",
      confirmLabel: "Remover credenciais",
      tone: "danger",
    });
    if (!ok) return;

    setBusy(true);
    const result = await removeOpenFinanceCredentials({ confirmation: "REMOVER CREDENCIAIS" });
    setBusy(false);
    setMessage(result.error ? result.error : "Credenciais removidas com sucesso.");
    router.refresh();
  }

  const hasConnections = setup.connections.length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Topo / Destaque quando há conexões vinculadas */}
      {hasConnections ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {setup.connections.length > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--text-muted)]">Conexão:</span>
                  <Select
                    aria-label="Conexão ativa"
                    value={activeConnection?.id ?? ""}
                    onChange={(e) => {
                      setConnectionId(e.target.value);
                      setRemote([]);
                      setRemoteSelection({});
                    }}
                    className="h-9 text-xs"
                  >
                    {setup.connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label || "Sem nome"} ({c.status})
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={() => setIsNewModalOpen(true)}
              className="gap-1.5 self-start sm:self-auto"
            >
              <Plus className="size-4" />
              Nova Conexão
            </Button>
          </div>

          {/* Card Principal: Conexão Ativa e Contas Vinculadas */}
          {activeConnection ? (
            <section className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--line)] pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--text)]">
                      {activeConnection.label || "Conexão sem nome"}
                    </h2>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        activeConnection.status === "UPDATED"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : activeConnection.lastErrorMessage
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          : "bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]"
                      }`}
                    >
                      {activeConnection.status === "UPDATED" ? "Sincronizado" : activeConnection.status}
                    </span>
                  </div>
                  <p className="muted text-xs">
                    Última sincronização bem-sucedida:{" "}
                    <span className="font-medium text-[var(--text)]">
                      {activeConnection.lastSyncedAt
                        ? new Date(activeConnection.lastSyncedAt).toLocaleString("pt-BR")
                        : "Nenhuma leitura concluída"}
                    </span>
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    setBusy(true);
                    setMessage("");
                    setSyncSummary(null);
                    const result = await syncOpenFinance(activeConnection.id);
                    setBusy(false);
                    setSyncSummary({ status: result.status ?? (result.error ? "ERROR" : "UPDATED"), imported: result.imported ?? 0, error: result.error, accounts: result.accounts ?? [] });
                    setMessage(result.error ?? `${result.imported} linha(s) lidas e atualizadas.`);
                    router.refresh();
                  }}
                  disabled={busy}
                  className="gap-1.5 shrink-0"
                >
                  <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
                  Sincronizar agora
                </Button>
              </div>

              {activeConnection.lastErrorMessage ? (
                <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Erro na última leitura:</strong>{" "}
                    <span>{activeConnection.lastErrorMessage}</span>
                  </div>
                </div>
              ) : null}

              {syncSummary ? (
                <section aria-live="polite" className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text)]">Resumo da última sincronização</h3>
                    <span className="text-xs text-[var(--text-muted)]">Status: {syncSummary.status} · {syncSummary.imported} inseridos/atualizados</span>
                  </div>
                  {syncSummary.error ? <p className="text-xs text-rose-600 dark:text-rose-400">{syncSummary.error}</p> : null}
                  {syncSummary.accounts.length ? syncSummary.accounts.map((account, index) => (
                    <div key={`${account.accountName}-${index}`} className="space-y-1 border-t border-[var(--border)] pt-3 text-xs">
                      <div className="flex flex-wrap justify-between gap-2 font-medium text-[var(--text)]">
                        <span>{account.accountName} · {account.accountType}</span>
                        <span>{account.status}</span>
                      </div>
                      <p className="text-[var(--text-muted)]">
                        Lidos: {account.read} · Ignorados por data: {account.ignoredByDate} · Bloqueados por exclusão: {account.ignoredByTombstone} · Tipo não importado: {account.ignoredByType} · Inválidos: {account.invalid} · Inseridos: {account.inserted} · Atualizados: {account.updated}
                      </p>
                      {account.error ? <p className="text-rose-600 dark:text-rose-400">{account.error}</p> : null}
                    </div>
                  )) : <p className="text-xs text-[var(--text-muted)]">Nenhuma conta local vinculada a esta conexão.</p>}
                </section>
              ) : null}

              {/* Contas Vinculadas */}
              <div className="space-y-3 pt-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)]">Contas Vinculadas</h3>
                    <p className="muted text-xs">Associe as contas descobertas na Pluggy às suas contas locais.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadAccounts()}
                    disabled={busy}
                    className="gap-1.5 self-start sm:self-auto"
                  >
                    <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
                    Carregar contas Pluggy
                  </Button>
                </div>

                {remote.some((account) => account.type === "CREDIT") && !setup.accounts.some((account) => account.type === "CREDIT_CARD") ? (
                  <div role="status" className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-[var(--text-muted)]">
                    O item Pluggy tem cartÃ£o de crÃ©dito, mas ainda nÃ£o hÃ¡ uma conta local de cartÃ£o para vinculÃ¡-lo. Em <Link className="font-medium text-[var(--text-brand)] underline" href="/configuracoes">ConfiguraÃ§Ãµes → Contas e cartÃµes → Nova conta</Link>, crie uma conta do tipo &ldquo;CartÃ£o de crÃ©dito&rdquo; e volte para selecionÃ¡-la aqui.
                  </div>
                ) : null}

                {remote.length ? (
                  <ul className="space-y-3">
                    {setup.accounts.map((a) => (
                      <li
                        key={a.id}
                        className="grid gap-2 rounded-lg bg-[var(--surface-2)] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                      >
                        <label htmlFor={`remote-${a.id}`} className="text-sm font-medium text-[var(--text)]">
                          {a.name}
                          <span className="muted block text-xs font-normal">
                            {a.type === "CREDIT_CARD" ? "Cartão de Crédito" : "Conta Bancária"} · modo{" "}
                            <strong className={a.financeMode === "integracao" ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-[var(--text-muted)] font-normal"}>
                              {a.financeMode === "integracao" ? "automático (Pluggy)" : "manual"}
                            </strong>
                            {a.type === "CREDIT_CARD" && a.creditLimitCents !== null
                              ? ` · limite ${formatCents(a.creditLimitCents ?? 0)} (${a.availableCreditCents === null ? "disponível indisponível" : `${formatCents(a.availableCreditCents)} disponível`})`
                              : ""}
                          </span>
                        </label>
                        <select
                          className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
                          id={`remote-${a.id}`}
                          value={remoteSelection[a.id] ?? a.externalAccountId ?? ""}
                          onChange={(event) => setRemoteSelection((current) => ({ ...current, [a.id]: event.target.value }))}
                        >
                          <option value="">Sem vínculo (modo manual)</option>
                          {remote
                            .filter((r) => (r.type === "CREDIT") === (a.type === "CREDIT_CARD"))
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.currency})
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={async () => {
                            const externalAccountId = (remoteSelection[a.id] ?? a.externalAccountId ?? "") || null;
                            setBusy(true);
                            const result = await linkOpenFinanceAccount({
                              accountId: a.id,
                              connectionId: activeConnection.id,
                              externalAccountId,
                              mode: externalAccountId ? "integracao" : "manual",
                            });
                            setBusy(false);
                            setMessage(result.error ?? "Vínculo salvo com sucesso; histórico preservado.");
                            router.refresh();
                          }}
                        >
                          Salvar modo
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center">
                    <p className="muted text-xs">
                      Clique em &ldquo;Carregar contas Pluggy&rdquo; acima para listar as contas disponíveis nesta conexão e configurar os vínculos locais.
                    </p>
                  </div>
                )}
              </div>

              {/* Faturas Pluggy */}
              {setup.invoices.length ? (
                <div className="space-y-2 border-t border-[var(--line)] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Faturas Pluggy</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {setup.invoices.map((invoice) => (
                      <div
                        key={`${invoice.accountId}-${invoice.invoiceRef}-${invoice.dueDate.toISOString()}`}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-3 text-xs space-y-1"
                      >
                        <p className="font-medium text-[var(--text)]">
                          {setup.accounts.find((a) => a.id === invoice.accountId)?.name ?? "Cartão"}
                        </p>
                        <p className="muted">
                          Vencimento: {invoice.dueDate.toLocaleDateString("pt-BR")}
                        </p>
                        <div className="flex items-center justify-between pt-1 text-[var(--text)] font-medium">
                          <span>Total: {invoice.totalAmountCents === null ? "indisponível" : formatCents(invoice.totalAmountCents)}</span>
                          {invoice.minimumPaymentCents !== null ? (
                            <span className="muted font-normal text-[0.7rem]">
                              Mínimo: {formatCents(invoice.minimumPaymentCents)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Área de Gerenciamento e Exclusão */}
          {activeConnection ? (
            <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="border-b border-[var(--line)] pb-3">
                <h2 className="text-sm font-semibold text-[var(--text)]">Administração da Conexão</h2>
                <p className="muted text-xs">
                  Gerencie ou remova a conexão &ldquo;{activeConnection.label || "ativa"}&rdquo; e seus dados importados.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-[var(--text)]">Limpar lançamentos importados</p>
                    <p className="muted text-xs">
                      Exclui os lançamentos e faturas trazidos da Pluggy por esta conexão, mantendo o vínculo ativo.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void deleteAll(activeConnection)}
                    className="shrink-0 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                  >
                    Excluir dados importados da Pluggy
                  </Button>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-[var(--text)]">Remover conexão (preservar lançamentos)</p>
                    <p className="muted text-xs">
                      Desvincula esta conexão, mas mantém todos os lançamentos já importados no seu histórico.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void removeConnection(activeConnection, false)}
                    className="shrink-0"
                  >
                    Remover conexão e manter lançamentos
                  </Button>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      Remover conexão e excluir lançamentos
                    </p>
                    <p className="muted text-xs">
                      Desvincula esta conexão e apaga todos os lançamentos e faturas originados por ela.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void removeConnection(activeConnection, true)}
                    className="shrink-0 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                  >
                    Remover conexão e excluir lançamentos Pluggy
                  </Button>
                </div>
              </div>

              <div className="border-t border-[var(--line)] pt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-[var(--text)]">Credenciais Pluggy</p>
                  <p className="muted text-xs">
                    {setup.connections.length > 0
                      ? "Remova todas as conexões antes de apagar as credenciais salvas."
                      : "Client ID e Client Secret cifrados salvos no banco."}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || setup.connections.length > 0 || !setup.credentialSaved}
                  onClick={() => void removeCredentials()}
                  className="shrink-0"
                >
                  Remover credenciais
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        /* Primeiro acesso: Formulário direto para cadastrar a primeira conexão */
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xs">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[var(--text)]">Conectar ao Open Finance (Pluggy)</h2>
            <p className="muted text-xs leading-relaxed">
              Conecte suas contas bancárias e cartões para sincronizar transações e saldos automaticamente.
              Os dados de acesso (Client ID, Client Secret e Item ID) são guardados cifrados com chave individual no banco de dados.
              {setup.credentialSaved
                ? " Suas credenciais já estão salvas; deixe Client ID e Client Secret em branco para manter os valores salvos."
                : " Preencha Client ID e Client Secret na primeira conexão."}
            </p>
          </div>

          <form action={save} className="space-y-3 pt-2">
            <Field label="Client ID">
              <Input
                name="clientId"
                placeholder={setup.credentialSaved ? "Salvo (deixe em branco para manter)" : "Informe seu Client ID"}
                autoComplete="off"
              />
            </Field>
            <Field label="Client Secret">
              <Input
                name="clientSecret"
                type="password"
                placeholder={setup.credentialSaved ? "•••••••••••• (deixe em branco para manter)" : "Informe seu Client Secret"}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Item ID (Pluggy)">
              <Input
                name="itemId"
                placeholder="Identificador do item gerado pelo Pluggy Connect"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Nome desta conexão">
              <Input
                name="label"
                placeholder="Ex.: Nubank Principal, Itaú PJ..."
                maxLength={100}
              />
            </Field>
            <Field label="Data inicial de importação">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                required
              />
            </Field>
            <p className="muted text-xs">
              Padrão: dia 1º do mês atual. Lançamentos manuais ou importados via CSV/OFX existentes não serão sobrescritos nem deduplicados automaticamente.
            </p>
            <SubmitButton disabled={busy}>Salvar e Conectar</SubmitButton>
          </form>
        </section>
      )}

      {/* Mensagem de status */}
      {message ? (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 rounded-lg p-3 text-xs ${
            message.toLowerCase().includes("erro") ||
            message.toLowerCase().includes("falha") ||
            message.toLowerCase().includes("confira")
              ? "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400"
              : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage("")}
            className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Dispensar aviso"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <p className="muted text-xs">
        Não há atualização em segundo plano do item, rotina agendada (cron), webhook ou widget na interface. As ações apenas leem e sincronizam os dados já processados e disponíveis na Pluggy.
      </p>

      {/* Modal para Adicionar Nova Conexão */}
      {mounted && isNewModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
                onClick={() => setIsNewModalOpen(false)}
                aria-hidden="true"
              />

              {/* Janela Modal */}
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={modalTitleId}
                className="relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl text-[var(--text)] max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--surface-2)] text-[var(--text)]">
                      <Plus className="size-4" />
                    </span>
                    <h2 id={modalTitleId} className="text-base font-semibold tracking-tight">
                      Nova Conexão Open Finance
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNewModalOpen(false)}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                    aria-label="Fechar"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <p className="muted text-xs mb-4">
                  {setup.credentialSaved
                    ? "Suas credenciais gerais da Pluggy já estão cadastradas. Informe o Item ID e um nome para esta nova conexão (ou preencha novos valores de Client ID e Secret se desejar alterá-los)."
                    : "Informe suas credenciais da Pluggy e o Item ID gerado pelo Pluggy Connect para iniciar a sincronização."}
                </p>

                <form action={save} className="space-y-3">
                  <Field label="Client ID">
                    <Input
                      name="clientId"
                      placeholder={setup.credentialSaved ? "Salvo (deixe em branco para manter)" : "Informe seu Client ID"}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Client Secret">
                    <Input
                      name="clientSecret"
                      type="password"
                      placeholder={setup.credentialSaved ? "•••••••••••• (deixe em branco para manter)" : "Informe seu Client Secret"}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Item ID (Pluggy)">
                    <Input
                      name="itemId"
                      placeholder="Identificador do item Pluggy"
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Field label="Nome desta conexão">
                    <Input
                      name="label"
                      placeholder="Ex.: Nubank Principal, Itaú PJ..."
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Data inicial de importação">
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      required
                    />
                  </Field>
                  <p className="muted text-xs">
                    Padrão: dia 1º do mês atual. Lançamentos manuais ou importações CSV/OFX existentes não serão apagados.
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line)]">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsNewModalOpen(false)}
                      disabled={busy}
                    >
                      Cancelar
                    </Button>
                    <SubmitButton disabled={busy}>Salvar Conexão</SubmitButton>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
