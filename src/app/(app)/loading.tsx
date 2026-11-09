export default function Loading() {
  return <section role="status" aria-busy="true" className="min-w-0 space-y-4 py-6">
    <p className="text-sm text-[var(--text-muted)]">Carregando seus dados…</p>
    <div aria-hidden="true" className="card h-40 bg-[var(--surface)]" />
    <div aria-hidden="true" className="card h-56 bg-[var(--surface)]" />
  </section>;
}
