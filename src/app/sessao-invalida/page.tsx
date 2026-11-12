import { Button } from "@/components/ui/button";

export const metadata = { title: "Sessão expirada" };

export default function InvalidSessionPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="card w-full max-w-sm p-5 sm:p-7">
        <h1 className="font-display text-display font-semibold tracking-tight">Sessão expirada</h1>
        <p className="muted mt-2 mb-6 text-sm">Sua sessão não está mais disponível. Confirme para entrar novamente.</p>
        <form action="/api/sessao-invalida" method="post">
          <Button type="submit" className="w-full">Entrar novamente</Button>
        </form>
      </div>
    </main>
  );
}
