"use client";

import { BillItem, type PlainBillRow, type PlainGroupingOption } from "./bill-item";
import { formatCents } from "@/lib/money";

export type { PlainBillRow };

/** Lista as contas do mês, agrupadas pelo agrupamento escolhido (ou "Sem agrupamento"). */
export function BillList({
  bills,
  monthLabel,
  groupings,
}: {
  bills: PlainBillRow[];
  monthLabel: string;
  groupings: PlainGroupingOption[];
}) {
  const groups = new Map<string, { name: string; items: PlainBillRow[] }>();
  for (const b of bills) {
    const key = b.groupingId ?? "__none__";
    const entry = groups.get(key) ?? { name: b.groupingName ?? "Sem agrupamento", items: [] };
    entry.items.push(b);
    groups.set(key, entry);
  }

  return (
    <div className="divide-y">
      {[...groups.entries()].map(([key, group]) => {
        const groupTotalCents = group.items.reduce((sum, b) => sum + b.totalCents, 0);
        return (
          <div key={key}>
            <div className="muted flex items-center justify-between gap-3 bg-[var(--surface-2)] px-4 py-2">
              <p className="text-xs font-semibold tracking-wide uppercase">{group.name}</p>
              <p className="tnum text-xs font-semibold">{formatCents(groupTotalCents)}</p>
            </div>
            <ul className="divide-y">
              {group.items.map((bill) => (
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
        );
      })}
    </div>
  );
}
