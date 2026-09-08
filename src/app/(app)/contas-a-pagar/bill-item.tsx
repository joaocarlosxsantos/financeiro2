"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, MessageCircle, Phone, Repeat, Trash2, UserPlus } from "lucide-react";
import { addBillParticipant, deleteBill, removeBillParticipant, updateBillGrouping } from "@/server/actions/bills";
import { Input, Select } from "@/components/ui/field";
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
};

export type PlainBill = {
  id: string;
  ruleId: string | null;
  name: string;
  type: "INDIVIDUAL" | "GROUP";
  totalCents: number;
  participants: PlainBillParticipant[];
};

/** Uma conta com o agrupamento junto — é o formato que a lista do mês inteiro usa (ver `bill-list.tsx`). */
export type PlainBillRow = PlainBill & { groupingId: string | null; groupingName: string | null };

export type PlainGroupingOption = { id: string; name: string; color: string };

export function BillItem({
  bill,
  monthLabel,
  allBills,
  groupings,
}: {
  bill: PlainBillRow;
  /** Rótulo do mês pronto (ex. "setembro de 2026"), pra mensagem do WhatsApp. */
  monthLabel: string;
  /** Todas as contas do mês (mesmo de outros agrupamentos) — usado só pra achar
   * outras contas em grupo do MESMO agrupamento na hora de montar a mensagem
   * consolidada do WhatsApp (ver `shareLinkFor` abaixo). */
  allBills: PlainBillRow[];
  /** Agrupamentos existentes, para o seletor de "mover de agrupamento". */
  groupings: PlainGroupingOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  const currentGrouping = groupings.find((g) => g.id === bill.groupingId);

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
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] font-medium">
            {bill.name}
            {bill.ruleId ? <Repeat className="muted ml-1.5 inline size-3 align-middle" /> : null}
          </p>
          {bill.type === "GROUP" && bill.participants.length ? (
            <p className="muted text-xs">
              {bill.participants.length} pessoa{bill.participants.length > 1 ? "s" : ""}
            </p>
          ) : null}
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
        <div className="space-y-4 border-t px-4 pt-3 pb-4">
          {groupings.length ? (
            <div>
              <p className="muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Agrupamento</p>
              <div className="relative">
                <span
                  className={`pointer-events-none absolute top-1/2 left-3 size-2 -translate-y-1/2 rounded-full ${
                    currentGrouping ? "" : "border-2 border-[var(--border)]"
                  }`}
                  style={currentGrouping ? { background: currentGrouping.color } : undefined}
                />
                <Select
                  aria-label="Agrupamento"
                  value={bill.groupingId ?? ""}
                  onChange={(e) =>
                    start(async () => void (await updateBillGrouping(bill.id, e.target.value || null)))
                  }
                  className="pl-7"
                >
                  <option value="">Sem agrupamento</option>
                  {groupings.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}

          {bill.type === "GROUP" ? (
            <div>
              <p className="muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Quem divide</p>
              <div className="divide-y rounded-xl border">
                {bill.participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-[0.8125rem]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.phone ? (
                        <p className="muted flex items-center gap-1 text-xs">
                          <Phone className="size-3" />
                          {p.phone}
                        </p>
                      ) : null}
                    </div>
                    <span className="tnum shrink-0 font-medium">{formatCents(p.amountCents)}</span>
                    {(() => {
                      const link = shareLinkFor(p);
                      return (
                        <a
                          href={link ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={
                            link ? `Enviar no WhatsApp para ${p.name}` : `Sem telefone válido para ${p.name}`
                          }
                          title={link ? "Enviar a parte dele no WhatsApp" : "Cadastre um telefone pra habilitar o WhatsApp"}
                          onClick={(e) => {
                            if (!link) e.preventDefault();
                          }}
                          className={`shrink-0 rounded-lg p-1.5 ${
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
                      className="muted shrink-0 cursor-pointer rounded-lg p-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="bg-[var(--surface-2)] px-3 py-2">
                  <AddParticipantForm billId={bill.id} />
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <p className="muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Valor</p>
            <BillAmountEditor
              billId={bill.id}
              totalCents={bill.totalCents}
              participants={bill.participants.map((p) => ({ id: p.id, name: p.name, amountCents: p.amountCents }))}
              onDone={() => setOpen(false)}
            />
          </div>
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
    <div className="flex items-center gap-2">
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
