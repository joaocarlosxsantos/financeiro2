import { cn } from "@/lib/cn";
import { Children, cloneElement, isValidElement, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { TriangleAlert } from "lucide-react";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");
  const describedChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const isControl =
      child.type === Input ||
      child.type === Select ||
      child.type === Textarea ||
      (typeof child.type === "string" && ["input", "select", "textarea"].includes(child.type));
    if (!isControl || (!describedBy && !error)) return child;

    const props = child.props as { "aria-describedby"?: string };
    return cloneElement(child as ReactElement<Record<string, unknown>>, {
      "aria-describedby": [props["aria-describedby"], describedBy].filter(Boolean).join(" "),
      ...(error ? { "aria-invalid": true } : {}),
    });
  });

  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-caption font-medium text-[var(--text-muted)]">
        {label}
      </span>
      {describedChildren}
      {hint ? <span id={hintId} className="muted mt-1 block text-xs leading-snug">{hint}</span> : null}
      {error ? (
        <span id={errorId} className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-[var(--text-out)]">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input-base", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("input-base cursor-pointer appearance-none pr-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("input-base min-h-20 resize-y", className)} {...props} />;
}
