"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

export function CardPicker({
  cards,
  currentId,
}: {
  cards: { id: string; name: string; color: string }[];
  currentId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border bg-[var(--surface)] p-1">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => router.push(`${pathname}?c=${card.id}`)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
            card.id === currentId ? "bg-brand-600 text-white" : "hover:bg-[var(--surface-2)]",
          )}
        >
          <span className="size-2 rounded-full" style={{ background: card.color }} />
          {card.name}
        </button>
      ))}
    </div>
  );
}
