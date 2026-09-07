"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Phone, Repeat, Trash2, UserPlus } from "lucide-react";
import {
  addBillParticipant,
  deleteBill,
  removeBillParticipant,
  toggleBillPaid,
  toggleParticipantPaid,
} from "@/server/actions/bills";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCents } from "@/lib/money";
import { BillAmountEditor } from "./bill-amount-editor";

export type PlainBillParticipant = {
  id: string;
  name: string;
  phone: string | null;
  amountCents: number;
  paid: boolean;
};

export type PlainBill = {
  id: string;
  ruleId: string | null;
  name: string;
  type: "INDIVIDUAL" | "GROUP";
  totalCents: number;
  paid: boolean;
  participants: PlainBillParticipant[];
};

export function BillItem({ bill }: { bill: PlainBill }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  const paidCount = bill.participants.filter((p) => p.paid).length;

  async function remove() {
    const ok = await confirm({
      title: `Excluir "${bill.name}"?`,
      description: "Não pode ser desfeito.",
      confirmLabel: "Excluir",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => void (await deleteBill(bill.id)));
  }

  return (
    <li className={pending ? "opacity-60" : undefined}>
      <div className="flex items-center gap-3 px-4 py-3">
        {bill.type === "INDIVIDUAL" ? (
          <button
            type="button"
            title={bill.paid ? "Marcar como pendente" : "Marcar como paga"}
            onClick={() => start(async () => void (await toggleBillPaid(bill.id)))}
            className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 text-[0.625rem] font-bold ${
              bill.paid
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-[var(--border)] text-transparent"
            }`}
          >
            ✓
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-medium">
            {bill.name}
            {bill.ruleId ? <Repeat className="muted ml-1.5 inline size-3 align-middle" /> : null}
          </p>
          <p className="muted text-xs">
            {bill.type === "GROUP" && bill.participants.length
              ? `${paidCount} de ${bill.participants.length} pagaram`
              : bill.paid
                ? "paga"
                : "pendente"}
          </p>
        </div>

        <span className="tnum text-[0.875rem] font-semibold">{formatCents(bill.totalCents)}</span>

        <button
          type="button"
          aria-label={open ? "Fechar detalhes" : "Ver detalhes"}
          onClick={() => setOpen((v) => !v)}
          className="muted shrink-0 cursor-pointer rounded-lg p-1.5 hover:bg-[var(--surface-2)]"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <button
          type="button"
          aria-label={`Excluir ${bill.name}`}
          onClick={() => void remove()}
          className="muted shrink-0 cursor-pointer rounded-lg p-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {open ? (
        <div className="space-y-3 px-4 pb-4">
          {bill.type === "GROUP" ? (
            <div className="space-y-1.5 rounded-xl border p-3">
              {bill.participants.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[0.8125rem]">
                  <button
                    type="button"
                    title={p.paid ? "Marcar como pendente" : "Marcar como pago"}
                    onClick={() => start(async () => void (await toggleParticipantPaid(p.id)))}
                    className={`flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 text-[0.5625rem] font-bold ${
                      p.paid
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-[var(--border)] text-transparent"
                    }`}
                  >
                    ✓
                  </button>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.phone ? (
                    <span className="muted flex shrink-0 items-center gap-1 text-xs">
                      <Phone className="size-3" />
                      {p.phone}
                    </span>
                  ) : null}
                  <span className="tnum shrink-0 font-medium">{formatCents(p.amountCents)}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${p.name}`}
                    onClick={() => start(async () => void (await removeBillParticipant(p.id)))}
                    className="muted shrink-0 cursor-pointer rounded-lg p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
              <AddParticipantForm billId={bill.id} />
            </div>
          ) : null}

          <BillAmountEditor
            billId={bill.id}
            totalCents={bill.totalCents}
            participants={bill.participants.map((p) => ({ id: p.id, name: p.name, amountCents: p.amountCents }))}
            onDone={() => setOpen(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

function AddParticipantForm({ billId }: { billId: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2 pt-1">
      <Input
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 flex-1 text-[0.8125rem]"
      />
      <Input
        placeholder="Telefone (opcional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="h-8 w-32 text-[0.8125rem]"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || !name.trim()}
        onClick={() =>
          start(async () => {
            const res = await addBillParticipant(billId, name, phone);
            if (!res.error) {
              setName("");
              setPhone("");
            }
          })
        }
      >
        <UserPlus className="size-3.5" />
      </Button>
    </div>
  );
}
