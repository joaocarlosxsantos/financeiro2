"use client";

import { BillItem, type PlainBill } from "./bill-item";
import type { MonthRef } from "@/lib/dates";

export type PlainBillRow = PlainBill & { groupingId: string | null; groupingName: string | null };

/** Lista as contas do mês, agrupadas pelo agrupamento escolhido (ou "Sem agrupamento"). */
export function BillList({ bills }: { bills: PlainBillRow[]; monthRef: MonthRef }) {
  const groups = new Map<string, { name: string; items: PlainBillRow[] }>();
  for (const b of bills) {
    const key = b.groupingId ?? "__none__";
    const entry = groups.get(key) ?? { name: b.groupingName ?? "Sem agrupamento", items: [] };
    entry.items.push(b);
    groups.set(key, entry);
  }

  return (
    <div className="divide-y">
      {[...groups.entries()].map(([key, group]) => (
        <div key={key}>
          <p className="muted bg-[var(--surface-2)] px-4 py-2 text-xs font-semibold tracking-wide uppercase">
            {group.name}
          </p>
          <ul className="divide-y">
            {group.items.map((bill) => (
              <BillItem key={bill.id} bill={bill} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
