"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MessageCircle, User } from "lucide-react";
import { BillItem, type PlainBillParticipant, type PlainBillRow, type PlainGroupingOption } from "./bill-item";
import { formatCents } from "@/lib/money";
import { buildBillShareMessage, buildWhatsAppLink, type BillShareEntry } from "@/lib/whatsapp";

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
  shares: PersonShare[];
};

function normalizePersonName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Lista as contas do mês com arquitetura colapsável em 2 níveis:
 * Nível 1: Grupos de contas (acordeão por agrupamento com total no cabeçalho).
 * Nível 2 (dentro do grupo):
 *   - Seção "Contas Individuais" (se houver).
 *   - Subgrupo "Contas Compartilhadas" com hierarquia Pessoa -> Contas
 *     (acordeão por pessoa com subtotal dela e botão de WhatsApp consolidado).
 */
export function BillList({
  bills,
  monthLabel,
  groupings,
}: {
  bills: PlainBillRow[];
  monthLabel: string;
  groupings: PlainGroupingOption[];
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedPeople, setCollapsedPeople] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function togglePerson(compositeKey: string) {
    setCollapsedPeople((prev) => ({ ...prev, [compositeKey]: !prev[compositeKey] }));
  }

  // Agrupamento Nível 1: Grupos de contas
  const groupMap = new Map<string, { name: string; color?: string; items: PlainBillRow[] }>();
  for (const b of bills) {
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

        const individualBills = group.items.filter((b) => b.type === "INDIVIDUAL");
        const sharedBills = group.items.filter((b) => b.type === "GROUP");

        // Agrupamento Nível 2 em contas compartilhadas: Pessoa -> Contas
        const peopleMap = new Map<string, PersonGroup>();
        const unassignedSharedBills: PlainBillRow[] = [];

        for (const bill of sharedBills) {
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
                shares: [],
              };
              peopleMap.set(pKey, person);
            } else if (!person.phone && p.phone?.trim()) {
              person.phone = p.phone.trim();
            }
            person.totalCents += p.amountCents;
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
              className="flex w-full cursor-pointer items-center justify-between gap-3 bg-[var(--surface-2)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]/80"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {group.color ? (
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                ) : null}
                <p className="truncate text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
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

            {/* Conteúdo expandido do Grupo */}
            {!isGroupCollapsed ? (
              <div>
                {/* a) Seção 'Contas Individuais' */}
                {individualBills.length > 0 ? (
                  <div className="border-t border-[var(--border)] first:border-t-0">
                    <div className="flex items-center justify-between bg-[var(--surface-2)]/40 px-4 py-1.5">
                      <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Contas Individuais ({individualBills.length})
                      </p>
                      <span className="tnum font-mono text-xs text-[var(--text-muted)]">
                        {formatCents(individualBills.reduce((acc, b) => acc + b.totalCents, 0))}
                      </span>
                    </div>
                    <ul className="divide-y divide-[var(--border)]">
                      {individualBills.map((bill) => (
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

                {/* b) Subgrupo separado 'Contas Compartilhadas' */}
                {sharedBills.length > 0 ? (
                  <div className={individualBills.length > 0 ? "border-t border-[var(--border)]" : ""}>
                    <div className="flex items-center justify-between bg-[var(--surface-2)]/40 px-4 py-1.5">
                      <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Contas Compartilhadas ({sharedBills.length})
                      </p>
                      <span className="tnum font-mono text-xs text-[var(--text-muted)]">
                        {formatCents(sharedBills.reduce((acc, b) => acc + b.totalCents, 0))}
                      </span>
                    </div>

                    {/* Hierarquia: Pessoa -> Conta */}
                    <div className="divide-y divide-[var(--border)]">
                      {people.map((person) => {
                        const pCompositeKey = `${groupKey}:${person.key}`;
                        const isPersonCollapsed = collapsedPeople[pCompositeKey] ?? false;

                        const entries: BillShareEntry[] = person.shares.map((s) => ({
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
                            {/* Cabeçalho da Pessoa (acordeão por pessoa) */}
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 transition-colors hover:bg-[var(--surface-2)]/60">
                              <button
                                type="button"
                                aria-expanded={!isPersonCollapsed}
                                onClick={() => togglePerson(pCompositeKey)}
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                              >
                                <User className="size-4 shrink-0 text-[var(--text-brand)]" />
                                <p className="truncate text-[0.875rem] font-medium text-[var(--text)]">
                                  {person.displayName}
                                </p>
                                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                                  ({person.shares.length} {person.shares.length === 1 ? "conta" : "contas"})
                                </span>
                              </button>

                              <div className="flex shrink-0 items-center gap-2">
                                <span className="tnum font-mono text-[0.875rem] font-semibold text-[var(--text-brand)]">
                                  {formatCents(person.totalCents)}
                                </span>

                                {whatsAppLink ? (
                                  <a
                                    href={whatsAppLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Enviar cobrança no WhatsApp para ${person.displayName}`}
                                    title={`Enviar no WhatsApp: ${person.displayName}`}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-button)] bg-[var(--color-money-in-soft)] px-2 py-1 text-xs font-medium text-[var(--text-in)] hover:opacity-85 transition-opacity"
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
                                    className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-button)] bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                                  >
                                    <MessageCircle className="size-3.5" />
                                    <span className="hidden sm:inline">WhatsApp</span>
                                  </button>
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
                                  className="cursor-pointer p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                                >
                                  {isPersonCollapsed ? (
                                    <ChevronDown className="size-4" />
                                  ) : (
                                    <ChevronUp className="size-4" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Conteúdo expandido da pessoa: lista de contas compartilhadas dela */}
                            {!isPersonCollapsed ? (
                              <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/20 pl-2 sm:pl-4">
                                <ul className="divide-y divide-[var(--border)]">
                                  {person.shares.map((share) => (
                                    <BillItem
                                      key={`${share.bill.id}:${share.participant.id}`}
                                      bill={share.bill}
                                      monthLabel={monthLabel}
                                      allBills={bills}
                                      groupings={groupings}
                                      participantShareCents={share.participant.amountCents}
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
                            {unassignedSharedBills.map((bill) => (
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
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
