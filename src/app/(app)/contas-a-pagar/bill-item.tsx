"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, MessageCircle, Phone, Repeat, Trash2, UserPlus } from "lucide-react";
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
import { buildBillShareMessage, buildWhatsAppLink } from "@/lib/whatsapp";
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

/** Uma conta com o agrupamento junto — é o formato que a lista do mês inteiro usa (ver `bill-list.tsx`). */
export type PlainBillRow = PlainBill & { groupingId: string | null; groupingName: string | null };

export function BillItem({
  bill,
  monthLabel,
  allBills,
}: {
  bill: PlainBillRow;
  /** Rótulo do mês pronto (ex. "setembro de 2026"), pra mensagem do WhatsApp. */
  monthLabel: string;
  /** Todas as contas do mês (mesmo de outros agrupamentos) — usado só pra achar
   * outras contas em grupo do MESMO agrupamento na hora de montar a mensagem
   * consolidada do WhatsApp (ver `shareLinkFor` abaixo). */
  allBills: PlainBillRow[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  const paidCount = bill.participants.filter((p) => p.paid).length;

  /**
   * Link do WhatsApp com a mensagem já pronta pra essa pessoa. Se a conta tem
   * agrupamento, junta com as outras contas EM GRUPO do mesmo agrupamento onde
   * uma pessoa de mesmo nome (comparação sem acento de maiúscula/minúscula)
   * também participa — é o que o João pediu: mandar tudo num só texto, não uma
   * mensagem por conta. Contas individuais do agrupamento ficam de fora (não
   * têm "parte" de ninguém pra listar).
   *
   * O telefone usado é o dessa pessoa NESTA conta, mas se ela não tiver
   * telefone cadastrado aqui, buscamos em outra conta do mesmo agrupamento
   * onde ela tenha — assim não é preciso recadastrar o telefone em toda
   * conta pra habilitar o botão.
   */
  function shareLinkFor(participant: PlainBillParticipant): string | null {
    const siblings = bill.groupingId
      ? allBills.filter((b) => b.groupingId === bill.groupingId && b.type === "GROUP")
      : [bill];

    const perSibling = siblings.map((b) => ({
      bill: b,
      match: b.participants.find((p) => p.name.trim().toLowerCase() === participant.name.trim().toLowerCase()),
    }));

    const entries = perSibling
      .filter((s) => s.match)
      .map((s) => ({ billName: s.bill.name, amountCents: s.match!.amountCents }));

    if (!entries.length) entries.push({ billName: bill.name, amountCents: participant.amountCents });

    const phone = participant.phone ?? perSibling.find((s) => s.match?.phone)?.match?.phone ?? null;

    const message = buildBillShareMessage({
      participantName: participant.name,
      monthLabel,
      groupingName: bill.groupingName,
      entries,
    });
    return buildWhatsAppLink(phone, message);
  }

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
                  {(() => {
                    const link = shareLinkFor(p);
                    return (
                      <a
                        href={link ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={link ? `Enviar no WhatsApp para ${p.name}` : `Sem telefone válido para ${p.name}`}
                        title={link ? "Enviar a parte dele no WhatsApp" : "Cadastre um telefone pra habilitar o WhatsApp"}
                        onClick={(e) => {
                          if (!link) e.preventDefault();
                        }}
                        className={`shrink-0 rounded-lg p-1 ${
                          link
                            ? "cursor-pointer text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                            : "muted cursor-not-allowed opacity-40"
                        }`}
                      >
                        <MessageCircle className="size-3.5" />
                      </a>
                    );
                  })()}
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
