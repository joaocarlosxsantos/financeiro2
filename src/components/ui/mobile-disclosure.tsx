"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Keeps secondary forms compact on mobile; desktop content stays visible. */
export function MobileDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="min-w-0">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border bg-[var(--surface-2)] px-3 py-2 text-left text-sm font-medium lg:hidden">
      <span className="min-w-0 break-words">{label}</span>
      <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
    </button>
    <div id={id} className={cn("min-w-0 lg:mt-0 lg:block", open ? "mt-3 block" : "hidden")}>
      {children}
    </div>
  </div>;
}
