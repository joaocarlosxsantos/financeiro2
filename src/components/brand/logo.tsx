import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return <svg viewBox="10 10 44 44" className={className} fill="currentColor" aria-hidden="true">
    <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="5" />
    <rect x="20" y="24.5" width="24" height="5" />
    <rect x="20" y="34.5" width="24" height="5" />
  </svg>;
}

const SW = { fill: "none", stroke: "currentColor", strokeWidth: 3.6, strokeMiterlimit: 2 } as const;

function Mutano() {
  return <>
    <path d="M4 30V4L15 19L26 4V30" />
    <path d="M35 12V21A9 9 0 0 0 53 21M53 12V30" />
    <path d="M65 5V22C65 27 67.5 30 72.5 30M59.5 12H72.5" />
    <circle cx="87" cy="21" r="9" /><path d="M96 12V30" />
    <path d="M105 30V12M105 21A9 9 0 0 1 123 21V30" />
    <circle cx="141" cy="21" r="9" />
  </>;
}

export function WordmarkCurto({ className }: { className?: string }) {
  return <svg viewBox="0 0 154 34" className={className} {...SW} aria-label="Mutano" role="img"><Mutano /></svg>;
}

export function Wordmark({ className }: { className?: string }) {
  return <svg viewBox="0 0 312 34" className={className} {...SW} aria-label="Mutano Contas" role="img">
    <Mutano />
    <path d="M191.3 7.5A13.5 13.5 0 1 0 191.3 25.5" />
    <circle cx="207" cy="21" r="9" />
    <path d="M225 30V12M225 21A9 9 0 0 1 243 21V30" />
    <path d="M255 5V22C255 27 257.5 30 262.5 30M249.5 12H262.5" />
    <circle cx="277" cy="21" r="9" /><path d="M286 12V30" />
    <path d="M307.5 15.5C306 13.2 304 12 301 12C297 12 295 14 295 16.5C295 19.3 297.5 20.3 301.5 21.3C305.5 22.3 308 23.3 308 26C308 28.2 305.5 30 301.5 30C298 30 295.7 28.8 294.5 26.5" />
  </svg>;
}

export function Logo({ className, compacto }: { className?: string; compacto?: boolean }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-6 text-[var(--text)]", className)}>
    <LogoMark className={compacto ? "h-7 w-auto shrink-0" : "h-7 w-auto shrink-0 lg:h-8"} />
    {compacto ? <WordmarkCurto className="h-5 w-auto shrink-0" /> : <Wordmark className="h-5 w-auto shrink-0 sm:h-6" />}
  </span>;
}
