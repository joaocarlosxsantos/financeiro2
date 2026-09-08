"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createBill, type ActionState } from "@/server/actions/bills";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { monthRefToParam, type MonthRef } from "@/lib/dates";

const initial: ActionState = {};

export type PlainGrouping = { id: string; name: string; color: string };

/**
 * Um único formulário para os dois jeitos de criar conta: recorrente (vira
 * regra, sem valor — regra não tem dinheiro próprio, cada mês tem o seu, só
 * dá pra preencher depois que a conta do mês existir) ou avulsa ("única deste
 * mês", já nasce presa a este mês — essa já pode receber o valor na hora,
 * pra não obrigar a criar e já ter que abrir de novo só pra digitar quanto é).
 * Conta em grupo mostra as linhas de pessoa (nome + telefone); se um valor for
 * informado na criação, ele já nasce dividido igualmente entre elas (dá pra
 * trocar pra divisão manual depois, editando a conta já criada).
 */
export function NewBillForm({ groupings, monthRef }: { groupings: PlainGrouping[]; monthRef: MonthRef }) {
  const [state, formAction] = useActionState(createBill, initial);
  const [recurring, setRecurring] = useState(true);
  const [type, setType] = useState<"INDIVIDUAL" | "GROUP">("INDIVIDUAL");
  const [rows, setRows] = useState([0]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      // `form.reset()` só volta os campos NÃO controlados (inputs de texto) —
      // `recurring` e `type` são estado React (para o Select mostrar a opção
      // certa), então precisam ser resetados aqui também. Sem isso, criar uma
      // conta avulsa uma vez faz a próxima criação "grudar" nessa escolha,
      // mesmo o formulário parecendo limpo.
      setRecurring(true);
      setType("INDIVIDUAL");
      setRows([0]);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="recurring" value={recurring ? "1" : ""} />
      <input type="hidden" name="year" value={monthRef.year} />
      <input type="hidden" name="month" value={monthRef.month} />

      <Field label="Nome">
        <Input name="name" required placeholder="Ex.: Conta de luz" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Repetição">
          <Select value={recurring ? "1" : "0"} onChange={(e) => setRecurring(e.target.value === "1")}>
            <option value="1">Repete todo mês</option>
            <option value="0">Única deste mês ({monthRefToParam(monthRef)})</option>
          </Select>
        </Field>
        <Field label="Tipo">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value as "INDIVIDUAL" | "GROUP")}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="GROUP">Em grupo (dividir)</option>
          </Select>
        </Field>
      </div>

      {!recurring ? (
        <Field
          label="Valor total"
          hint={
            type === "GROUP"
              ? "Opcional — se preencher, começa dividido igualmente entre as pessoas abaixo. Dá pra ajustar depois."
              : "Opcional — dá pra deixar em branco e preencher depois, abrindo a conta na lista."
          }
        >
          <Input name="total" inputMode="decimal" placeholder="0,00" />
        </Field>
      ) : (
        <p className="muted -mt-1 text-xs leading-relaxed">
          Conta recorrente não tem valor fixo — depois que a conta deste mês for gerada (veja o
          aviso no topo da lista), o valor é preenchido mês a mês, abrindo a conta na lista.
        </p>
      )}

      {groupings.length ? (
        <Field label="Agrupamento" hint="Opcional — só para organizar.">
          <Select name="groupingId" defaultValue="">
            <option value="">Sem agrupamento</option>
            {groupings.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {type === "GROUP" ? (
        <div className="space-y-2 rounded-xl border bg-[var(--surface-2)] p-3">
          <p className="text-[0.8125rem] font-medium">Quem divide essa conta</p>
          {rows.map((key, i) => (
            <div key={key} className="flex items-center gap-2">
              <Input name="participantName" placeholder="Nome" required className="flex-1" />
              <Input name="participantPhone" placeholder="Telefone (opcional)" className="w-36" />
              {rows.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remover pessoa"
                  onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
                  className="muted shrink-0 cursor-pointer rounded-lg p-2 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((r) => [...r, (r.at(-1) ?? 0) + 1])}
            className="inline-flex cursor-pointer items-center gap-1.5 text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            <Plus className="size-3.5" />
            Adicionar pessoa
          </button>
        </div>
      ) : null}

      {state.error ? <p className="text-[0.8125rem] text-rose-600 dark:text-rose-400">{state.error}</p> : null}
      <SubmitButton size="sm" className="w-full" pendingLabel="Criando...">
        Criar conta
      </SubmitButton>
    </form>
  );
}
