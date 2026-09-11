"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArchiveRestore, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import {
  createAccount,
  deleteAccount,
  deleteAccountPermanently,
  restoreAccount,
  updateAccount,
  type ActionState,
} from "@/server/actions/settings";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { Button, SubmitButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

const initial: ActionState = {};

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  CASH: "Dinheiro",
  INVESTMENT: "Investimento",
};

type Account = {
  id: string;
  name: string;
  type: string;
  color: string;
  institution: string | null;
  archived: boolean;
  transactionCount: number;
  recurringCount: number;
};

export function AccountsPanel({ accounts }: { accounts: Account[] }) {
  const [state, formAction] = useActionState(createAccount, initial);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  const toggleEdit = (id: string) => setEditingId((current) => (current === id ? null : id));

  async function archive(a: Account) {
    const ok = await confirm({
      title: `Arquivar a conta "${a.name}"?`,
      description: "Os lançamentos continuam salvos. A conta some das telas de lançar e importar, mas fica listada aqui.",
      confirmLabel: "Arquivar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => void (await deleteAccount(a.id)));
  }

  async function removeForever(a: Account) {
    const pieces = [
      a.transactionCount > 0 ? `${a.transactionCount} lançamento(s)` : null,
      a.recurringCount > 0 ? `${a.recurringCount} recorrência(s)` : null,
    ].filter(Boolean);
    const description =
      pieces.length > 0
        ? `Isso apaga a conta e ${pieces.join(" e ")} dela para sempre. Não tem como desfazer.`
        : "Essa conta não tem lançamentos. A exclusão não tem como ser desfeita.";
    const ok = await confirm({
      title: `Excluir "${a.name}" definitivamente?`,
      description,
      confirmLabel: "Excluir para sempre",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => void (await deleteAccountPermanently(a.id)));
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y rounded-xl border">
        {active.map((a) => (
          <li key={a.id} className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-medium">{a.name}</p>
                <p className="muted truncate text-xs">
                  {TYPE_LABEL[a.type] ?? a.type}
                  {a.institution ? ` · ${a.institution}` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Editar ${a.name}`}
                onClick={() => toggleEdit(a.id)}
                className="muted cursor-pointer rounded-lg p-2.5 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Arquivar ${a.name}`}
                onClick={() => void archive(a)}
                className="muted cursor-pointer rounded-lg p-2.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {editingId === a.id ? (
              <EditForm account={a} onDone={() => toggleEdit(a.id)} />
            ) : null}
          </li>
        ))}
        {!active.length ? (
          <li>
            <EmptyState
              icon={Wallet}
              title="Nenhuma conta cadastrada"
              description="Toda movimentação precisa estar em uma conta. Crie a primeira abaixo — pode ser sua conta corrente, um cartão ou até dinheiro em espécie."
            />
          </li>
        ) : null}
      </ul>

      {archived.length ? (
        <div>
          <h3 className="muted mb-2 text-xs font-semibold tracking-wide uppercase">
            Arquivadas
          </h3>
          <ul className="divide-y rounded-xl border border-dashed bg-[var(--surface-2)]">
            {archived.map((a) => (
              <li key={a.id} className="px-4 py-2.5 opacity-70">
                <div className="flex items-center gap-3">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] font-medium">
                      {a.name}
                      <span className="muted ml-2 text-xs font-normal">arquivada</span>
                    </p>
                    <p className="muted truncate text-xs">
                      {TYPE_LABEL[a.type] ?? a.type}
                      {a.institution ? ` · ${a.institution}` : ""}
                      {` · ${a.transactionCount} lançamento(s)`}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Editar ${a.name}`}
                    onClick={() => toggleEdit(a.id)}
                    className="muted cursor-pointer rounded-lg p-2.5 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Reativar ${a.name}`}
                    onClick={() => start(async () => void (await restoreAccount(a.id)))}
                    className="muted cursor-pointer rounded-lg p-2.5 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10"
                  >
                    <ArchiveRestore className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${a.name} definitivamente`}
                    onClick={() => void removeForever(a)}
                    className="muted cursor-pointer rounded-lg p-2.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {editingId === a.id ? (
                  <EditForm account={a} onDone={() => toggleEdit(a.id)} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {open ? (
        <form ref={ref} action={formAction} className="space-y-3 rounded-xl border bg-[var(--surface-2)] p-4">
          <Field label="Nome">
            <Input name="name" required placeholder="Ex.: Nubank" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select name="type" defaultValue="CHECKING">
                <option value="CHECKING">Conta corrente</option>
                <option value="SAVINGS">Poupança</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
                <option value="CASH">Dinheiro</option>
                <option value="INVESTMENT">Investimento</option>
              </Select>
            </Field>
            <Field label="Instituição (opcional)">
              <Input name="institution" placeholder="Ex.: Banco Inter" />
            </Field>
          </div>
          {state.error ? <p className="text-[0.8125rem] text-rose-600">{state.error}</p> : null}
          <div className="flex gap-2">
            <SubmitButton size="sm">Adicionar conta</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Nova conta
        </Button>
      )}
    </div>
  );
}

function EditForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const [state, formAction] = useActionState(updateAccount, initial);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (state.ok) doneRef.current();
  }, [state]);

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border bg-[var(--surface-2)] p-3">
      <input type="hidden" name="id" value={account.id} />
      <Field label="Nome">
        <Input name="name" required defaultValue={account.name} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <Select name="type" defaultValue={account.type}>
            <option value="CHECKING">Conta corrente</option>
            <option value="SAVINGS">Poupança</option>
            <option value="CREDIT_CARD">Cartão de crédito</option>
            <option value="CASH">Dinheiro</option>
            <option value="INVESTMENT">Investimento</option>
          </Select>
        </Field>
        <Field label="Instituição (opcional)">
          <Input name="institution" defaultValue={account.institution ?? ""} placeholder="Ex.: Banco Inter" />
        </Field>
      </div>
      <Field label="Cor">
        <Input name="color" type="color" defaultValue={account.color} className="h-11 w-24 p-1" />
      </Field>
      {state.error ? <p className="text-[0.8125rem] text-rose-600">{state.error}</p> : null}
      <div className="flex gap-2">
        <SubmitButton size="sm">Salvar</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
