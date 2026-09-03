"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createCategory, deleteCategory, updateCategory, type ActionState } from "@/server/actions/settings";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, SubmitButton } from "@/components/ui/button";

const initial: ActionState = {};

type Cat = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  color: string;
  keywords: string[];
};

export function CategoriesPanel({ categories }: { categories: Cat[] }) {
  const [state, formAction] = useActionState(createCategory, initial);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  const income = categories.filter((c) => c.kind === "INCOME");
  const expense = categories.filter((c) => c.kind === "EXPENSE");

  const toggleEdit = (id: string) => setEditingId((current) => (current === id ? null : id));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Group
          title="Entradas"
          items={income}
          editingId={editingId}
          onDelete={(id, name) => remove(id, name, start)}
          onToggleEdit={toggleEdit}
        />
        <Group
          title="Saídas"
          items={expense}
          editingId={editingId}
          onDelete={(id, name) => remove(id, name, start)}
          onToggleEdit={toggleEdit}
        />
      </div>

      {open ? (
        <form ref={ref} action={formAction} className="space-y-3 rounded-xl border bg-[var(--surface-2)] p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nome">
              <Input name="name" required placeholder="Ex.: Pet" />
            </Field>
            <Field label="Tipo">
              <Select name="kind" defaultValue="EXPENSE">
                <option value="EXPENSE">Saída</option>
                <option value="INCOME">Entrada</option>
              </Select>
            </Field>
            <Field label="Natureza">
              <Select name="nature" defaultValue="VARIABLE">
                <option value="VARIABLE">Variável</option>
                <option value="FIXED">Fixo</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Palavras-chave"
            hint="Usadas para categorizar automaticamente na importação. Ex.: petz, cobasi, ração"
          >
            <Input name="keywords" placeholder="petz, cobasi, racao" />
          </Field>
          <Field label="Cor">
            <Input name="color" type="color" defaultValue="#64748b" className="h-11 w-24 p-1" />
          </Field>
          {state.error ? <p className="text-[0.8125rem] text-rose-600">{state.error}</p> : null}
          <div className="flex gap-2">
            <SubmitButton size="sm">Adicionar categoria</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Nova categoria
        </Button>
      )}
    </div>
  );
}

function remove(id: string, name: string, start: (cb: () => void) => void) {
  if (!confirm(`Arquivar a categoria "${name}"? Os lançamentos existentes continuam salvos.`)) return;
  start(async () => void (await deleteCategory(id)));
}

function Group({
  title,
  items,
  editingId,
  onDelete,
  onToggleEdit,
}: {
  title: string;
  items: Cat[];
  editingId: string | null;
  onDelete: (id: string, name: string) => void;
  onToggleEdit: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="muted mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
      <ul className="divide-y rounded-xl border">
        {items.map((c) => (
          <li key={c.id} className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-medium">
                  {c.name}
                  {c.kind === "EXPENSE" ? (
                    <span className="muted ml-2 text-xs font-normal">
                      {c.nature === "FIXED" ? "fixo" : "variável"}
                    </span>
                  ) : null}
                </p>
                {c.keywords.length ? (
                  <p className="muted truncate text-xs">{c.keywords.slice(0, 6).join(", ")}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`Editar ${c.name}`}
                onClick={() => onToggleEdit(c.id)}
                className="muted cursor-pointer rounded-lg p-1.5 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Arquivar ${c.name}`}
                onClick={() => onDelete(c.id, c.name)}
                className="muted cursor-pointer rounded-lg p-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {editingId === c.id ? (
              <EditForm category={c} onDone={() => onToggleEdit(c.id)} />
            ) : null}
          </li>
        ))}
        {!items.length ? (
          <li className="muted px-4 py-5 text-center text-[0.8125rem]">Nada aqui ainda.</li>
        ) : null}
      </ul>
    </div>
  );
}

function EditForm({ category, onDone }: { category: Cat; onDone: () => void }) {
  const [state, formAction] = useActionState(updateCategory, initial);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (state.ok) doneRef.current();
  }, [state]);

  return (
    <form
      action={formAction}
      className="mt-3 space-y-3 rounded-xl border bg-[var(--surface-2)] p-3"
    >
      <input type="hidden" name="id" value={category.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nome">
          <Input name="name" required defaultValue={category.name} />
        </Field>
        <Field label="Tipo">
          <Select name="kind" defaultValue={category.kind}>
            <option value="EXPENSE">Saída</option>
            <option value="INCOME">Entrada</option>
          </Select>
        </Field>
        <Field label="Natureza">
          <Select name="nature" defaultValue={category.nature}>
            <option value="VARIABLE">Variável</option>
            <option value="FIXED">Fixo</option>
          </Select>
        </Field>
      </div>
      <Field
        label="Palavras-chave"
        hint="Usadas para categorizar automaticamente na importação. Ex.: petz, cobasi, ração"
      >
        <Input name="keywords" defaultValue={category.keywords.join(", ")} placeholder="petz, cobasi, racao" />
      </Field>
      <Field label="Cor">
        <Input name="color" type="color" defaultValue={category.color} className="h-11 w-24 p-1" />
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
