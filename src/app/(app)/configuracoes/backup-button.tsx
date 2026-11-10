"use client";

import { useState, useTransition } from "react";
import { Download, Lock } from "lucide-react";
import { Sheet } from "@/components/sheet";
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
        <Sheet title="Confirmar senha" maxWidth="md" onClose={handleClose} closeDisabled={isPending}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--acento)]">
                <Lock className="h-5 w-5" />
              </div>
              <div>

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
        </Sheet>
      )}
    </>
  );
}
