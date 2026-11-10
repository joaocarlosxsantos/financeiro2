"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  CreditCard,
  Plus,
  ReceiptText,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Sheet } from "@/components/sheet";
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
type SyncAccountSummary = {
  accountName: string;
  accountType: string;
  read: number;
  ignoredByDate: number;
  ignoredByTombstone: number;
  ignoredByType: number;
  invalid: number;
  inserted: number;
  updated: number;
  status: string;
  error?: string;
};

type ActiveSheet = "new" | "accounts" | "sync_details" | "manage" | null;

export function IntegrationPanel({ initial }: { initial: Setup }) {
  const router = useRouter();
  const confirm = useConfirm();

  const [setup, setSetup] = useState(initial);
  const [connectionId, setConnectionId] = useState(initial.connections[0]?.id ?? "");
  const [remote, setRemote] = useState<Remote[]>([]);
  const [remoteSelection, setRemoteSelection] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [syncSummary, setSyncSummary] = useState<{
    status: string;
    imported: number;
    error?: string;
    accounts: SyncAccountSummary[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [fromDate, setFromDate] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Apply refreshed server setup props and repair a connection selection that no longer exists.
    setSetup(initial);
    if (!initial.connections.some((c) => c.id === connectionId)) {
      setConnectionId(initial.connections[0]?.id ?? "");
      setRemote([]);
    }
  }, [initial, connectionId]);

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

    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[name="clientId"], input[name="clientSecret"], input[name="itemId"], input[name="label"]',
    );
    inputs.forEach((input) => {
      input.value = "";
    });

    setActiveSheet(null);
    setMessage("Conexão salva com sucesso. Os campos de credenciais foram limpos.");
    router.refresh();
  }

  async function loadAccounts() {
    if (!activeConnection?.id) return;
    setBusy(true);
    const result = await discoverOpenFinanceAccounts(activeConnection.id);
    setBusy(false);
    if (result.error) setMessage(result.error);
    else {
      setRemote(result.accounts ?? []);
      setRemoteSelection({});
    }
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

    setActiveSheet(null);
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

    setActiveSheet(null);
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
    setActiveSheet(null);
    setMessage(result.error ? result.error : "Credenciais removidas com sucesso.");
    router.refresh();
  }

  const hasConnections = setup.connections.length > 0;
  const linkedAccountsCount = setup.accounts.filter((a) => a.financeMode === "integracao").length;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Mensagem de Feedback */}
      {message ? (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl p-3.5 text-xs ${
            message.toLowerCase().includes("erro") ||
            message.toLowerCase().includes("falha") ||
            message.toLowerCase().includes("confira")
              ? "bg-[var(--out-soft)] border border-[var(--line-strong)] text-[var(--text-out)]"
              : "bg-[var(--in-soft)] border border-[var(--line-strong)] text-[var(--text-in)]"
          }`}
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage("")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/5"
            aria-label="Dispensar aviso"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {hasConnections && activeConnection ? (
        <>
          {/* 1. Status Principal & Ação Primária */}
          <section className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`inline-block size-2.5 rounded-full ${
                      activeConnection.status === "UPDATED"
                        ? "bg-[var(--text-in)] shadow-[0_0_8px_rgba(79,214,160,0.4)]"
                        : activeConnection.lastErrorMessage
                        ? "bg-[var(--text-out)] shadow-[0_0_8px_rgba(255,122,107,0.4)]"
                        : "bg-[var(--text-warn)]"
                    }`}
                    aria-hidden="true"
                  />
                  <h2 className="text-heading font-semibold text-[var(--text)] truncate">
                    {activeConnection.label || "Conexão sem nome"}
                  </h2>
                  <span className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[0.6875rem] font-medium text-[var(--text-muted)]">
                    {activeConnection.status === "UPDATED" ? "Conectado" : activeConnection.status}
                  </span>
                </div>

                <p className="text-xs text-[var(--text-muted)]">
                  {activeConnection.lastSyncedAt
                    ? `Última sincronização: ${new Date(activeConnection.lastSyncedAt).toLocaleString("pt-BR")}`
                    : "Nenhuma sincronização concluída"}
                </p>

                {setup.connections.length > 1 ? (
                  <div className="pt-2">
                    <label htmlFor="conn-selector" className="sr-only">Trocar conexão</label>
                    <Select
                      id="conn-selector"
                      value={activeConnection.id}
                      onChange={(e) => {
                        setConnectionId(e.target.value);
                        setRemote([]);
                        setRemoteSelection({});
                      }}
                      className="h-9 min-h-11 text-xs"
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

              {/* Ação Primária Única */}
              <Button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  setMessage("");
                  setSyncSummary(null);
                  const result = await syncOpenFinance(activeConnection.id);
                  setBusy(false);
                  setSyncSummary({
                    status: result.status ?? (result.error ? "ERROR" : "UPDATED"),
                    imported: result.imported ?? 0,
                    error: result.error,
                    accounts: result.accounts ?? [],
                  });
                  setMessage(result.error ?? `${result.imported} lançamento(s) atualizados.`);
                  router.refresh();
                }}
                disabled={busy}
                className="min-h-12 w-full sm:w-auto shrink-0 gap-2 font-medium"
              >
                <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
                Sincronizar agora
              </Button>
            </div>

            {activeConnection.lastErrorMessage ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-[var(--line-strong)] bg-[var(--out-soft)] p-3 text-xs text-[var(--text-out)]">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Erro na leitura:</strong>{" "}
                  <span>{activeConnection.lastErrorMessage}</span>
                </div>
              </div>
            ) : null}
          </section>

          {/* 2. Menu Secundário: Linhas de Navegação para Sheets */}
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
            <div className="divide-y divide-[var(--line)]">
              {/* Contas Vinculadas */}
              <button
                type="button"
                onClick={() => {
                  setActiveSheet("accounts");
                  if (remote.length === 0) void loadAccounts();
                }}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] min-h-14"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]">
                    <CreditCard className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)]">Contas vinculadas</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {linkedAccountsCount > 0
                        ? `${linkedAccountsCount} conta(s) em sincronização automática`
                        : "Nenhuma conta local associada à Pluggy"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" />
              </button>

              {/* Faturas e Resumo de Sincronização */}
              <button
                type="button"
                onClick={() => setActiveSheet("sync_details")}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] min-h-14"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]">
                    <ReceiptText className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)]">Histórico e faturas</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {setup.invoices.length > 0
                        ? `${setup.invoices.length} fatura(s) detectada(s) · ver detalhes de importação`
                        : "Detalhes e contadores da última leitura"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" />
              </button>

              {/* Adicionar Nova Conexão */}
              <button
                type="button"
                onClick={() => setActiveSheet("new")}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] min-h-14"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]">
                    <Plus className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)]">Adicionar nova conexão</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      Conectar outro banco ou conta Pluggy
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" />
              </button>

              {/* Administração da Conexão */}
              <button
                type="button"
                onClick={() => setActiveSheet("manage")}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] min-h-14"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]">
                    <SlidersHorizontal className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)]">Gerenciar conexão</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      Limpar lançamentos importados, desvincular ou remover
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)]" />
              </button>
            </div>
          </section>
        </>
      ) : (
        /* Estado Vazio: Nenhum banco conectado */
        <section className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 md:p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]">
            <CreditCard className="size-6" />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-heading font-semibold text-[var(--text)]">Conectar ao Open Finance</h2>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Sincronize transações e saldos de suas contas bancárias e cartões diretamente pelo Pluggy.
              Suas credenciais são guardadas de forma cifrada no banco de dados.
            </p>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              onClick={() => setActiveSheet("new")}
              className="min-h-12 w-full sm:w-auto px-6 font-medium gap-2"
            >
              <Plus className="size-4" />
              Conectar conta
            </Button>
          </div>

          {setup.credentialSaved ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => void removeCredentials()}
                disabled={busy}
                className="text-xs text-[var(--text-muted)] underline hover:text-[var(--text)]"
              >
                Remover credenciais Pluggy salvas
              </button>
            </div>
          ) : null}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SHEET 1: Nova Conexão */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeSheet === "new" ? (
        <Sheet title="Nova conexão Open Finance" onClose={() => setActiveSheet(null)}>
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {setup.credentialSaved
                ? "Suas credenciais gerais da Pluggy já estão salvas. Preencha apenas o Item ID e um nome (ou informe novas credenciais se desejar atualizá-las)."
                : "Informe seu Client ID, Client Secret e o Item ID gerado pelo Pluggy Connect para iniciar a integração."}
            </p>

            <form action={save} className="space-y-3.5">
              <Field label="Client ID">
                <Input
                  className="min-h-12 text-base!"
                  name="clientId"
                  placeholder={setup.credentialSaved ? "Salvo (deixe em branco para manter)" : "Informe seu Client ID"}
                  autoComplete="off"
                />
              </Field>

              <Field label="Client Secret">
                <Input
                  className="min-h-12 text-base!"
                  name="clientSecret"
                  type="password"
                  placeholder={setup.credentialSaved ? "•••••••••••• (deixe em branco para manter)" : "Informe seu Client Secret"}
                  autoComplete="new-password"
                />
              </Field>

              <Field label="Item ID (Pluggy)">
                <Input
                  className="min-h-12 text-base!"
                  name="itemId"
                  placeholder="Identificador do item Pluggy"
                  autoComplete="off"
                  required
                />
              </Field>

              <Field label="Nome desta conexão">
                <Input
                  className="min-h-12 text-base!"
                  name="label"
                  placeholder="Ex.: Nubank Principal, Itaú PJ..."
                  maxLength={100}
                />
              </Field>

              <Field label="Data inicial de importação">
                <Input
                  className="min-h-12 text-base!"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  required
                />
              </Field>

              <p className="text-xs text-[var(--text-muted)]">
                Lançamentos manuais ou importações CSV/OFX existentes não serão apagados.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--line)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveSheet(null)}
                  disabled={busy}
                  className="min-h-11"
                >
                  Cancelar
                </Button>
                <SubmitButton className="min-h-11" disabled={busy}>
                  Salvar Conexão
                </SubmitButton>
              </div>
            </form>
          </div>
        </Sheet>
      ) : null}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SHEET 2: Contas Vinculadas */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeSheet === "accounts" && activeConnection ? (
        <Sheet title="Contas vinculadas" onClose={() => setActiveSheet(null)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--line)] pb-3">
              <p className="text-xs text-[var(--text-muted)]">
                Associe as contas descobertas na Pluggy às suas contas locais cadastradas.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadAccounts()}
                disabled={busy}
                className="min-h-11 gap-1.5 shrink-0 self-start sm:self-auto"
              >
                <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
                Atualizar contas Pluggy
              </Button>
            </div>

            {remote.some((account) => account.type === "CREDIT") &&
            !setup.accounts.some((account) => account.type === "CREDIT_CARD") ? (
              <div role="status" className="rounded-xl border border-[var(--line-strong)] bg-[var(--warn-soft)] p-3 text-xs text-[var(--text-muted)]">
                O item Pluggy tem cartão de crédito, mas ainda não há uma conta local de cartão. Em{" "}
                <Link className="font-medium text-[var(--text)] underline inline-flex min-h-11 items-center" href="/configuracoes">
                  Configurações → Contas e cartões → Nova conta
                </Link>
                , crie uma conta do tipo &ldquo;Cartão de crédito&rdquo; e volte para vinculá-la.
              </div>
            ) : null}

            {remote.length ? (
              <ul className="space-y-3">
                {setup.accounts.map((a) => (
                  <li
                    key={a.id}
                    className="grid gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 sm:grid-cols-[minmax(0,1fr)_1fr_auto] sm:items-end"
                  >
                    <label htmlFor={`remote-${a.id}`} className="text-sm font-medium text-[var(--text)]">
                      {a.name}
                      <span className="block text-xs font-normal text-[var(--text-muted)] mt-0.5">
                        {a.type === "CREDIT_CARD" ? "Cartão de Crédito" : "Conta Bancária"} · modo{" "}
                        <strong className={a.financeMode === "integracao" ? "text-[var(--text-in)] font-medium" : "text-[var(--text-muted)] font-normal"}>
                          {a.financeMode === "integracao" ? "automático (Pluggy)" : "manual"}
                        </strong>
                        {a.type === "CREDIT_CARD" && a.creditLimitCents !== null
                          ? ` · limite ${formatCents(a.creditLimitCents ?? 0)} (${a.availableCreditCents === null ? "indisponível" : `${formatCents(a.availableCreditCents)} disponível`})`
                          : ""}
                      </span>
                    </label>

                    <select
                      id={`remote-${a.id}`}
                      value={remoteSelection[a.id] ?? a.externalAccountId ?? ""}
                      onChange={(event) => setRemoteSelection((current) => ({ ...current, [a.id]: event.target.value }))}
                      className="min-h-12 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base! sm:text-sm text-[var(--text)]"
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
                      className="min-h-11 shrink-0"
                    >
                      Salvar vínculo
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--line-strong)] p-6 text-center space-y-1">
                <p className="text-xs font-medium text-[var(--text)]">Contas ainda não carregadas</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Clique no botão &ldquo;Atualizar contas Pluggy&rdquo; acima para listar as contas disponíveis nesta conexão.
                </p>
              </div>
            )}
          </div>
        </Sheet>
      ) : null}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SHEET 3: Histórico e Faturas */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeSheet === "sync_details" && activeConnection ? (
        <Sheet title="Histórico e faturas" onClose={() => setActiveSheet(null)}>
          <div className="space-y-5">
            {/* Resumo da última sync */}
            {syncSummary ? (
              <section aria-live="polite" className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Última leitura realizada</h3>
                  <span className="text-xs text-[var(--text-muted)]">
                    Status: {syncSummary.status} · {syncSummary.imported} inseridos/atualizados
                  </span>
                </div>
                {syncSummary.error ? (
                  <p className="text-xs text-[var(--text-out)]">{syncSummary.error}</p>
                ) : null}
                {syncSummary.accounts.length ? (
                  syncSummary.accounts.map((account, index) => (
                    <div key={`${account.accountName}-${index}`} className="space-y-1 text-xs pt-1">
                      <div className="flex flex-wrap justify-between gap-2 font-medium text-[var(--text)]">
                        <span>{account.accountName} ({account.accountType})</span>
                        <span className="text-[var(--text-muted)]">{account.status}</span>
                      </div>
                      <p className="text-[var(--text-muted)]">
                        Lidos: {account.read} · Inseridos: {account.inserted} · Atualizados: {account.updated} · Ignorados: {account.ignoredByDate + account.ignoredByType + account.ignoredByTombstone}
                      </p>
                      {account.error ? <p className="text-[var(--text-out)]">{account.error}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Nenhuma conta local vinculada a esta conexão.</p>
                )}
              </section>
            ) : (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs text-[var(--text-muted)]">
                Nenhuma sincronização executada nesta sessão. Clique em &ldquo;Sincronizar agora&rdquo; na tela principal para ler novos dados.
              </div>
            )}

            {/* Faturas Pluggy */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Faturas Pluggy ({setup.invoices.length})
              </h3>
              {setup.invoices.length ? (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {setup.invoices.map((invoice) => (
                    <div
                      key={`${invoice.accountId}-${invoice.invoiceRef}-${invoice.dueDate.toISOString()}`}
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-xs space-y-1.5"
                    >
                      <p className="font-semibold text-[var(--text)]">
                        {setup.accounts.find((a) => a.id === invoice.accountId)?.name ?? "Cartão"}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        Vencimento: {invoice.dueDate.toLocaleDateString("pt-BR")}
                      </p>
                      <div className="flex items-center justify-between pt-1 font-medium text-[var(--text)] border-t border-[var(--line)]">
                        <span>Total: {invoice.totalAmountCents === null ? "indisponível" : formatCents(invoice.totalAmountCents)}</span>
                        {invoice.minimumPaymentCents !== null ? (
                          <span className="text-[var(--text-muted)] font-normal text-[0.6875rem]">
                            Mín: {formatCents(invoice.minimumPaymentCents)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">Nenhuma fatura de cartão de crédito registrada no momento.</p>
              )}
            </div>
          </div>
        </Sheet>
      ) : null}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SHEET 4: Gerenciar Conexão */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeSheet === "manage" && activeConnection ? (
        <Sheet title="Gerenciar conexão" onClose={() => setActiveSheet(null)}>
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              Opções de manutenção e desvinculação da conexão &ldquo;{activeConnection.label || "ativa"}&rdquo;.
            </p>

            <div className="space-y-3">
              {/* Opção 1: Limpar dados */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 space-y-2.5">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">Limpar lançamentos importados</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Exclui transações e faturas trazidas por esta conexão, mantendo a conexão ativa para futuras leituras.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void deleteAll(activeConnection)}
                  className="min-h-11 w-full sm:w-auto text-[var(--text-out)] hover:bg-[var(--out-soft)] hover:text-[var(--text-out)]"
                >
                  Excluir dados importados
                </Button>
              </div>

              {/* Opção 2: Desconectar mantendo histórico */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 space-y-2.5">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">Desconectar e manter histórico</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Desvincula esta conexão, mas preserva todos os lançamentos já importados no seu histórico contábil.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void removeConnection(activeConnection, false)}
                  className="min-h-11 w-full sm:w-auto"
                >
                  Desconectar (manter histórico)
                </Button>
              </div>

              {/* Opção 3: Desconectar e apagar tudo */}
              <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] p-4 space-y-2.5">
                <div>
                  <p className="text-sm font-medium text-[var(--text-out)]">Desconectar e apagar lançamentos</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Desvincula a conexão e remove todas as transações e faturas originadas por ela.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void removeConnection(activeConnection, true)}
                  className="min-h-11 w-full sm:w-auto text-[var(--text-out)] hover:bg-[var(--out-soft)] hover:text-[var(--text-out)]"
                >
                  Desconectar e apagar lançamentos
                </Button>
              </div>
            </div>

            {/* Credenciais Gerais */}
            <div className="pt-3 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-[var(--text)]">Credenciais gerais Pluggy</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {setup.connections.length > 0
                    ? "Remova todas as conexões ativas antes de apagar as credenciais salvas."
                    : "Client ID e Client Secret cifrados salvos no banco."}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || setup.connections.length > 0 || !setup.credentialSaved}
                onClick={() => void removeCredentials()}
                className="min-h-11 shrink-0"
              >
                Remover credenciais
              </Button>
            </div>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
