"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, MessageCircle, User, Users, Wallet } from "lucide-react";
import { BillItem, type PlainBillParticipant, type PlainBillRow, type PlainGroupingOption } from "./bill-item";
import { formatCents } from "@/lib/money";
import { buildBillShareMessage, buildWhatsAppLink, type BillShareEntry } from "@/lib/whatsapp";
import { sortBills, sortParticipantShares } from "@/lib/bills";
import { EmptyState } from "@/components/ui/empty";
import type { BillsTabType } from "./bills-tabs";

export type { PlainBillRow };

type PersonShare = {
  bill: PlainBillRow;
  participant: PlainBillParticipant;
};

type PersonGroup = {
  key: string;
  displayName: string;
  phone: string | null;
  totalCents: number;
  pendingCents: number;
  receivedCents: number;
  shares: PersonShare[];
};

function normalizePersonName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Lista as contas do mês separada em abas:
 * - Aba Contas: contas individuais ordenadas com sortBills (pendentes/vencidas primeiro, pagas ao fim).
 * - Aba Compartilhadas: resumo de valores a receber vs recebidos, estrutura Grupo -> Pessoa -> Conta,
 *   com pagamento individual de participante e WhatsApp focado em pendências.
 */
export function BillList({
  bills,
  monthLabel,
  groupings,
  activeTab = "contas",
}: {
  bills: PlainBillRow[];
  monthLabel: string;
  groupings: PlainGroupingOption[];
  activeTab?: BillsTabType;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedPeople, setCollapsedPeople] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function togglePerson(compositeKey: string) {
    setCollapsedPeople((prev) => ({ ...prev, [compositeKey]: !prev[compositeKey] }));
  }

  // =========================================================================
  // ABA CONTAS (type === "INDIVIDUAL")
  // =========================================================================
  if (activeTab === "contas") {
    const individualBills = bills.filter((b) => b.type === "INDIVIDUAL");

    if (!individualBills.length) {
      return (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta individual"
          description="Crie uma conta individual no formulário ao lado para começar a controlar."
        />
      );
    }

    const groupMap = new Map<string, { name: string; color?: string; items: PlainBillRow[] }>();
    for (const b of individualBills) {
      const key = b.groupingId ?? "__none__";
      const foundGrouping = groupings.find((g) => g.id === b.groupingId);
      const entry = groupMap.get(key) ?? {
        name: b.groupingName ?? foundGrouping?.name ?? "Sem agrupamento",
        color: foundGrouping?.color,
        items: [],
      };
      entry.items.push(b);
      groupMap.set(key, entry);
    }

    return (
      <div className="divide-y divide-[var(--border)]">
        {[...groupMap.entries()].map(([groupKey, group]) => {
          const groupTotalCents = group.items.reduce((sum, b) => sum + b.totalCents, 0);
          const isGroupCollapsed = collapsedGroups[groupKey] ?? false;
          // Ordenação pura de @/lib/bills: não pagas primeiro (vencidas no topo), pagas ao final
          const sortedItems = sortBills(group.items);

          return (
            <div key={groupKey}>
              {/* Cabeçalho do Grupo (Nível 1) */}
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                aria-expanded={!isGroupCollapsed}
                className="min-h-11 min-w-11 flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 bg-[var(--surface-2)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--acento)]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {group.color ? (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  ) : null}
                  <p className="truncate text-xs font-semibold tracking-normal text-[var(--text-muted)]">
                    {group.name}
                  </p>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    ({group.items.length})
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="tnum font-mono text-xs font-semibold text-[var(--text)]">
                    {formatCents(groupTotalCents)}
                  </span>
                  {isGroupCollapsed ? (
                    <ChevronDown className="size-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronUp className="size-4 text-[var(--text-muted)]" />
                  )}
                </div>
              </button>

              {!isGroupCollapsed ? (
                <ul className="divide-y divide-[var(--border)] transition-all duration-300">
                  {sortedItems.map((bill) => (
                    <BillItem
                      key={bill.id}
                      bill={bill}
                      monthLabel={monthLabel}
                      allBills={bills}
                      groupings={groupings}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  // =========================================================================
  // ABA COMPARTILHADAS (type === "GROUP")
  // =========================================================================
  const sharedBills = bills.filter((b) => b.type === "GROUP");

  if (!sharedBills.length) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhuma conta compartilhada"
        description="Crie uma conta em grupo (dividir) no formulário ao lado para ratear despesas."
      />
    );
  }

  // Totais da aba: pendente a receber vs já recebido
  let totalSharedPending = 0;
  let totalSharedReceived = 0;
  for (const b of sharedBills) {
    for (const p of b.participants) {
      if (p.paid) {
        totalSharedReceived += p.amountCents;
      } else {
        totalSharedPending += p.amountCents;
      }
    }
  }

  // Agrupamento por Grupo
  const groupMap = new Map<string, { name: string; color?: string; items: PlainBillRow[] }>();
  for (const b of sharedBills) {
    const key = b.groupingId ?? "__none__";
    const foundGrouping = groupings.find((g) => g.id === b.groupingId);
    const entry = groupMap.get(key) ?? {
      name: b.groupingName ?? foundGrouping?.name ?? "Sem agrupamento",
      color: foundGrouping?.color,
      items: [],
    };
    entry.items.push(b);
    groupMap.set(key, entry);
  }

  return (
    <div>
      {/* Cabeçalho de resumo da aba: total a receber pendente e já recebido */}
      <div className="grid grid-cols-2 gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] p-3 sm:p-4">
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold tracking-normal text-[var(--text-muted)]">
            A Receber (Pendente)
          </p>
          <p className="tnum mt-1 font-mono text-base font-bold text-[var(--text-out)] sm:text-lg">
            {formatCents(totalSharedPending)}
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold tracking-normal text-[var(--text-muted)]">
            Já Recebido
          </p>
          <p className="tnum mt-1 font-mono text-base font-bold text-[var(--text-in)] sm:text-lg">
            {formatCents(totalSharedReceived)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {[...groupMap.entries()].map(([groupKey, group]) => {
          const groupTotalCents = group.items.reduce((sum, b) => sum + b.totalCents, 0);
          const isGroupCollapsed = collapsedGroups[groupKey] ?? false;

          // Agrupamento Nível 2 em contas compartilhadas: Pessoa -> Contas
          const peopleMap = new Map<string, PersonGroup>();
          const unassignedSharedBills: PlainBillRow[] = [];

          for (const bill of group.items) {
            if (!bill.participants.length) {
              unassignedSharedBills.push(bill);
              continue;
            }
            for (const p of bill.participants) {
              const pKey = normalizePersonName(p.name);
              let person = peopleMap.get(pKey);
              if (!person) {
                person = {
                  key: pKey,
                  displayName: p.name.trim(),
                  phone: p.phone?.trim() || null,
                  totalCents: 0,
                  pendingCents: 0,
                  receivedCents: 0,
                  shares: [],
                };
                peopleMap.set(pKey, person);
              } else if (!person.phone && p.phone?.trim()) {
                person.phone = p.phone.trim();
              }
              person.totalCents += p.amountCents;
              if (p.paid) {
                person.receivedCents += p.amountCents;
              } else {
                person.pendingCents += p.amountCents;
              }
              person.shares.push({ bill, participant: p });
            }
          }

          const people = Array.from(peopleMap.values()).sort((a, b) =>
            a.displayName.localeCompare(b.displayName),
          );

          return (
            <div key={groupKey}>
              {/* Cabeçalho do Grupo (Nível 1) */}
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                aria-expanded={!isGroupCollapsed}
                className="min-h-11 min-w-11 flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 bg-[var(--surface-2)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--acento)]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {group.color ? (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  ) : null}
                  <p className="truncate text-xs font-semibold tracking-normal text-[var(--text-muted)]">
                    {group.name}
                  </p>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    ({group.items.length})
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="tnum font-mono text-xs font-semibold text-[var(--text)]">
                    {formatCents(groupTotalCents)}
                  </span>
                  {isGroupCollapsed ? (
                    <ChevronDown className="size-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronUp className="size-4 text-[var(--text-muted)]" />
                  )}
                </div>
              </button>

              {!isGroupCollapsed ? (
                <div className="divide-y divide-[var(--border)]">
                  {people.map((person) => {
                    const pCompositeKey = `${groupKey}:${person.key}`;
                    const isPersonCollapsed = collapsedPeople[pCompositeKey] ?? false;

                    // Mensagem WhatsApp apenas com as contas PENDENTES daquela pessoa
                    const pendingShares = person.shares.filter((s) => !s.participant.paid);

                    const entries: BillShareEntry[] = pendingShares.map((s) => ({
                      billName: s.bill.name,
                      amountCents: s.participant.amountCents,
                    }));

                    const message = buildBillShareMessage({
                      participantName: person.displayName,
                      monthLabel,
                      groupingName: group.name === "Sem agrupamento" ? null : group.name,
                      entries,
                    });

                    const whatsAppLink = buildWhatsAppLink(person.phone, message);

                    return (
                      <div key={person.key}>
                        {/* Cabeçalho da Pessoa (acordeão por pessoa, alvo >= 44px) */}
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-[var(--surface-2)] sm:px-4">
                          <button
                            type="button"
                            aria-expanded={!isPersonCollapsed}
                            onClick={() => togglePerson(pCompositeKey)}
                            className="min-h-11 min-w-11 flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-[var(--acento)]"
                          >
                            <User className="size-4 shrink-0 text-[var(--text-brand)]" />
                            <p className="break-words text-[0.875rem] font-medium text-[var(--text)]">
                              {person.displayName}
                            </p>
                            <span className="shrink-0 text-xs text-[var(--text-muted)]">
                              ({person.shares.length} {person.shares.length === 1 ? "conta" : "contas"})
                            </span>
                          </button>

                          <div className="flex shrink-0 items-center gap-2">
                            {/* Subtotal destacando pendente vs pago */}
                            <div className="flex flex-col items-end text-right">
                              {person.pendingCents > 0 ? (
                                <>
                                  {/* Mobile: empilhado para economizar espaço em 360px */}
                                  <div className="flex flex-col items-end sm:hidden">
                                    <span className="tnum font-mono text-xs font-semibold text-[var(--text-out)]">
                                      {formatCents(person.pendingCents)}
                                    </span>
                                    <span className="text-xs font-medium text-[var(--text-out)]">
                                      pendente
                                    </span>
                                  </div>
                                  {/* Desktop: em linha */}
                                  <span className="hidden tnum font-mono text-xs font-semibold text-[var(--text-out)] sm:inline sm:text-[0.875rem]">
                                    {formatCents(person.pendingCents)} pendente
                                  </span>
                                </>
                              ) : (
                                <span className="tnum font-mono text-xs font-semibold text-[var(--text-in)] sm:text-[0.875rem]">
                                  Tudo pago
                                </span>
                              )}
                              {person.receivedCents > 0 && person.pendingCents > 0 ? (
                                <>
                                  {/* Mobile: empilhado para economizar espaço em 360px */}
                                  <div className="flex flex-col items-end sm:hidden">
                                    <span className="tnum font-mono text-xs text-[var(--text-muted)]">
                                      {formatCents(person.receivedCents)}
                                    </span>
                                    <span className="text-xs text-[var(--text-muted)]">
                                      pago
                                    </span>
                                  </div>
                                  {/* Desktop: em linha */}
                                  <span className="hidden tnum font-mono text-xs text-[var(--text-muted)] sm:inline">
                                    {formatCents(person.receivedCents)} pago
                                  </span>
                                </>
                              ) : null}
                            </div>

                            {/* Botão de WhatsApp apenas com as pendências */}
                            {pendingShares.length > 0 ? (
                              whatsAppLink ? (
                                <a
                                  href={whatsAppLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Enviar cobrança no WhatsApp para ${person.displayName}`}
                                  title={`Cobrar ${formatCents(person.pendingCents)} pendente de ${person.displayName} no WhatsApp`}
                                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-[var(--radius-button)] bg-[var(--color-money-in-soft)] px-2.5 py-1 text-xs font-medium text-[var(--text-in)] transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-[var(--acento)]"
                                >
                                  <MessageCircle className="size-3.5" />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  aria-label={`Sem telefone para WhatsApp de ${person.displayName}`}
                                  title="Cadastre um telefone em uma das contas para habilitar o WhatsApp"
                                  className="min-h-11 min-w-11 inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-[var(--radius-button)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                                >
                                  <MessageCircle className="size-3.5" />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </button>
                              )
                            ) : (
                              <span
                                title="Todas as contas deste participante estão pagas"
                                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-[var(--radius-button)] bg-[var(--color-money-in-soft)] px-2.5 py-1 text-xs font-medium text-[var(--text-in)] opacity-80"
                              >
                                <Check className="size-3.5" />
                                <span className="hidden sm:inline">Pago</span>
                              </span>
                            )}

                            <button
                              type="button"
                              aria-expanded={!isPersonCollapsed}
                              aria-label={
                                isPersonCollapsed
                                  ? `Expandir contas de ${person.displayName}`
                                  : `Recolher contas de ${person.displayName}`
                              }
                              onClick={() => togglePerson(pCompositeKey)}
                              className="min-h-11 min-w-11 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--acento)]"
                            >
                              {isPersonCollapsed ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronUp className="size-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Conteúdo expandido da pessoa: lista de contas com toggle de pagamento individual */}
                        {!isPersonCollapsed ? (
                          <div className="border-t border-[var(--border)] bg-[var(--surface-2)] pl-2 sm:pl-4">
                            <ul className="divide-y divide-[var(--border)]">
                              {sortParticipantShares(person.shares).map((share) => (
                                <BillItem
                                  key={`${share.bill.id}:${share.participant.id}`}
                                  bill={share.bill}
                                  monthLabel={monthLabel}
                                  allBills={bills}
                                  groupings={groupings}
                                  participantShareCents={share.participant.amountCents}
                                  participantId={share.participant.id}
                                  participantPaid={share.participant.paid}
                                />
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {unassignedSharedBills.length > 0 ? (
                    <div className="p-3">
                      <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                        Contas sem participantes cadastrados:
                      </p>
                      <ul className="divide-y divide-[var(--border)]">
                        {sortBills(unassignedSharedBills).map((bill) => (
                          <BillItem
                            key={bill.id}
                            bill={bill}
                            monthLabel={monthLabel}
                            allBills={bills}
                            groupings={groupings}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
