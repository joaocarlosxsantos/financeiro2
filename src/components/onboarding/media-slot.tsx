"use client";

import { useState } from "react";

export function OnboardingMediaSlot({
  src,
  alt,
  caption,
  type = "image",
}: {
  src: string;
  alt: string;
  caption: string;
  type?: "image" | "video";
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="overflow-hidden rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)]">
      {failed ? (
        <div className="p-4" role="note">
          <p className="text-sm font-medium text-[var(--text)]">Imagem ou vídeo demonstrativo ainda não disponível</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{alt}</p>
        </div>
      ) : type === "video" ? (
        <video className="max-h-64 w-full bg-black" controls preload="none" aria-label={alt} onError={() => setFailed(true)}>
          <source src={src} />
          Seu navegador não consegue reproduzir este vídeo. {alt}
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- media slots intentionally use public assets supplied by the product owner.
        <img src={src} alt={alt} className="max-h-64 w-full object-contain" onError={() => setFailed(true)} />
      )}
      <figcaption className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--text-muted)]">{caption}</figcaption>
    </figure>
  );
}
