import Link from "next/link";
import { cn } from "@/lib/cn";
import { isDestinationActive, type NavigationSection } from "./navigation-model";

export function NavigationSections({ sections, pathname, surface, onNavigate }: {
  sections: NavigationSection[]; pathname: string; surface: "desktop" | "more"; onNavigate?: () => void;
}) {
  return <div className="space-y-5">
    {sections.map((section) => <section key={section.id} aria-labelledby={`${surface}-${section.id}`}>
      <h2 id={`${surface}-${section.id}`} className="mb-1 px-3 text-xs font-semibold text-[var(--text-muted)]">{section.label}</h2>
      <ul className="space-y-1">
        {section.items.map(({ href, label, icon: Icon }) => {
          const active = isDestinationActive(pathname, href);
          return <li key={href}><Link href={href} replace={surface === "more"} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)]", active ? "bg-[var(--surface-2)] font-medium text-[var(--text)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]")}>
            <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.5} />{label}
          </Link></li>;
        })}
      </ul>
    </section>)}
  </div>;
}
