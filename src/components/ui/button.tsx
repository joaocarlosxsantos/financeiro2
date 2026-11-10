"use client";

import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "soft" | "cta";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--acento)] text-[var(--on-acento)] hover:opacity-90",
  secondary:
    "border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]",
  soft: "border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]",
  outline:
    "border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]",
  ghost: "border border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)]",
  danger:
    "border border-[var(--text-out)] bg-transparent text-[var(--text-out)] hover:bg-[var(--out-soft)]",
  cta: "glass-cta",
};

const sizes: Record<Size, string> = {
  sm: "h-11 px-3 text-[0.8125rem] rounded-lg gap-1.5 md:h-9",
  md: "h-12 px-4 text-sm rounded-xl gap-2 md:h-10",
  icon: "size-11 rounded-xl p-0",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex min-w-0 max-w-full whitespace-normal cursor-pointer items-center justify-center gap-2 font-medium transition-[background-color,color,border-color,opacity,transform] duration-150 active:scale-[.98] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acento)] disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

/** Botão de submit que se desabilita sozinho enquanto a action roda. */
export function SubmitButton({
  children,
  pendingLabel = "Salvando...",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
