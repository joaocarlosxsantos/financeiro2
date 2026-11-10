"use client";

import { useState, useTransition } from "react";
import { Download, Lock, X } from "lucide-react";
import { requestExportToken } from "@/server/actions/export";

export function BackupButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setPassword("");
    setError(null);
    setIsOpen(true);
  }

  function handleClose() {
    if (isPending) return;
    setIsOpen(false);
    setPassword("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError("Informe sua senha.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await requestExportToken(password);
      if (!res.ok || !res.token) {
        setError(res.error ?? "Senha incorreta.");
        return;
      }

      // Token temporário válido por 5 minutos: dispara o download nativo do arquivo
      setIsOpen(false);
      setPassword("");
      const downloadUrl = `/api/exportar/backup?token=${encodeURIComponent(res.token)}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] focus-visible:ring-2 focus-visible:ring-[var(--acento)]"
      >
        <Download className="h-4 w-4 text-[var(--text-muted)]" />
        <span>Baixar backup (JSON)</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reauth-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              aria-label="Fechar"
              className="absolute top-4 right-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-button)] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--acento)]">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 id="reauth-modal-title" className="text-base font-semibold text-[var(--text)]">
                  Confirmar senha
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Por segurança, confirme sua senha para baixar o backup completo.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="reauth-password-input"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                >
                  Sua senha
                </label>
                <input
                  id="reauth-password-input"
                  type="password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  disabled={isPending}
                  className="w-full min-h-11 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--acento)]"
                />
              </div>

              {error && (
                <p className="text-xs font-medium text-[var(--coral,red)]" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] border border-[var(--border)] bg-transparent px-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] bg-[var(--btn-brand)] px-4 text-sm font-medium text-[var(--on-acento)] hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? "Confirmando..." : "Confirmar e baixar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
