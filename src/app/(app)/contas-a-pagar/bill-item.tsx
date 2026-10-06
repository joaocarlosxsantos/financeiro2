"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, ChevronUp, MessageCircle, Phone, Repeat, Trash2, UserPlus } from "lucide-react";
import { addBillParticipant, deleteBill, removeBillParticipant, toggleBillPaid, updateBillGrouping } from "@/server/actions/bills";
import { getBillStatus } from "@/lib/bills";
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
  paid: boolean;
  dueDay: number | null;
  year: number;
  month: number;
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
  participantShareCents,
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
  /** Se informado, exibe o valor da parte da pessoa em vez do total da conta (usado na visualização Pessoa -> Conta). */
  participantShareCents?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = useConfirm();

  const currentGrouping = groupings.find((g) => g.id === bill.groupingId);
  const status = getBillStatus({
    paid: bill.paid,
    dueDay: bill.dueDay,
    year: bill.year,
    month: bill.month,
  });

  function togglePaid() {
    start(async () => {
      await toggleBillPaid(bill.id, !bill.paid);
    });
  }

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
    <li className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2">
        {/* Informações da conta com controle semântico unificado de pago (checkbox + nome) */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={bill.paid}
              aria-label={bill.paid ? `Marcar ${bill.name} como pendente` : `Marcar ${bill.name} como paga`}
              disabled={pending}
              onClick={togglePaid}
              className="group flex min-h-[44px] min-w-0 cursor-pointer items-center gap-2 -ml-2 pl-2 rounded-lg text-left transition-colors hover:bg-[var(--surface-2)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  bill.paid
                    ? "border-[var(--text-in)] bg-[var(--color-money-in-soft)] text-[var(--text-in)]"
                    : "border-[var(--border)] bg-transparent group-hover:border-[var(--text-brand)] text-transparent"
                }`}
              >
                <Check className={`size-3.5 stroke-[2.5] ${bill.paid ? "opacity-100" : "opacity-0 group-hover:opacity-20"}`} />
              </span>

              <span
                className={`truncate text-[0.875rem] font-medium group-hover:underline ${
                  bill.paid ? "text-[var(--text-muted)] line-through" : "text-[var(--text)]"
                }`}
              >
                {bill.name}
              </span>
            </button>

            {bill.ruleId ? <Repeat className="muted size-3 shrink-0" /> : null}

            {/* Status Badge */}
            <span
              className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-semibold leading-none ${
                status === "PAGA"
                  ? "bg-[var(--color-money-in-soft)] text-[var(--text-in)]"
                  : status === "VENCIDA"
                    ? "bg-[var(--color-money-out-soft)] text-[var(--text-out)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)]"
              }`}
            >
              {status === "PAGA" ? "Paga" : status === "VENCIDA" ? "Vencida" : "Pendente"}
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)] pl-7">
            {bill.dueDay ? <span>Vencimento dia {bill.dueDay}</span> : null}
            {bill.type === "GROUP" && bill.participants.length && participantShareCents === undefined ? (
              <span>
                {bill.participants.length} pessoa{bill.participants.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </div>

        {/* Valor da conta */}
        <div className="flex shrink-0 flex-col items-end">
          {participantShareCents !== undefined ? (
            <>
              <span className="tnum font-mono text-[0.875rem] font-semibold text-[var(--text)]">
                {formatCents(participantShareCents)}
              </span>
              {participantShareCents !== bill.totalCents ? (
                <span className="tnum font-mono text-xs text-[var(--text-muted)]">
                  total {formatCents(bill.totalCents)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="tnum font-mono text-[0.875rem] font-semibold text-[var(--text)]">
              {formatCents(bill.totalCents)}
            </span>
          )}
        </div>

        <button
          type="button"
          aria-expanded={open}
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
          className="muted shrink-0 cursor-pointer rounded-lg p-1.5 hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
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
              {(() => {
                const sum = bill.participants.reduce((acc, p) => acc + p.amountCents, 0);
                const diff = bill.totalCents - sum;
                if (diff !== 0) {
                  return (
                    <p className={`mb-2 text-xs font-medium ${diff > 0 ? "text-[var(--text-warn)]" : "text-[var(--text-out)]"}`}>
                      {diff > 0 ? `Falta dividir ${formatCents(diff)}` : `Passou ${formatCents(-diff)} do total`}
                    </p>
                  );
                }
                return null;
              })()}
              <div className="divide-y divide-[var(--border)] rounded-[var(--radius-card)] border border-[var(--border)]">
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
                    <span className="tnum font-mono shrink-0 font-medium">{formatCents(p.amountCents)}</span>
                    {(() => {
                      const link = shareLinkFor(p);
                      return link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Enviar no WhatsApp para ${p.name}`}
                          title="Enviar a parte dele no WhatsApp"
                          className="shrink-0 cursor-pointer rounded-lg p-1.5 text-[var(--text-in)] hover:bg-[var(--color-money-in-soft)]"
                        >
                          <MessageCircle className="size-3.5" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          aria-label={`Sem telefone válido para ${p.name}`}
                          title="Cadastre um telefone pra habilitar o WhatsApp"
                          className="muted shrink-0 cursor-not-allowed rounded-lg p-1.5 opacity-40"
                        >
                          <MessageCircle className="size-3.5" />
                        </button>
                      );
                    })()}
                    <button
                      type="button"
                      aria-label={`Remover ${p.name}`}
                      onClick={() => start(async () => void (await removeBillParticipant(p.id)))}
                      className="muted shrink-0 cursor-pointer rounded-lg p-1.5 hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
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
            <p className="muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Valor e Vencimento</p>
            <BillAmountEditor
              billId={bill.id}
              totalCents={bill.totalCents}
              dueDay={bill.dueDay}
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
        aria-label="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 flex-1 text-[0.8125rem]"
      />
      <Input
        placeholder="Telefone (opcional)"
        aria-label="Telefone (opcional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="h-8 w-32 text-[0.8125rem]"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Adicionar pessoa"
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
