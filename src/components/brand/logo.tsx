import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return <svg viewBox="10 10 44 44" className={className} fill="currentColor" aria-hidden="true">
    <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="5" />
    <rect x="20" y="24.5" width="24" height="5" />
    <rect x="20" y="34.5" width="24" height="5" />
  </svg>;
}

export function Wordmark({ className }: { className?: string }) {
  return <svg viewBox="0 0 108 34" className={className} fill="none" stroke="currentColor" strokeWidth="3.6" aria-label="razão" role="img">
    <path d="M3.8 10V30M3.8 21C3.8 14.5 7.5 11.8 13.5 11.8" />
    <circle cx="26.4" cy="20" r="8.2" /><path d="M34.6 10V30" />
    <path d="M43 11.8H58L43 28.2H58.2" />
    <circle cx="72" cy="20" r="8.2" /><path d="M80.2 10V30" />
    <path d="M66.5 4.6C68 2 70 2 72 4S76 6.2 77.5 3.6" strokeWidth="2.2" />
    <circle cx="95" cy="20" r="8.2" />
  </svg>;
}

export function Logo({ className }: { className?: string }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-6 text-[var(--text)]", className)}>
    <LogoMark className="h-7 w-auto shrink-0 lg:h-8" />
    <Wordmark className="h-5 w-auto shrink-0 lg:h-6" />
  </span>;
}
