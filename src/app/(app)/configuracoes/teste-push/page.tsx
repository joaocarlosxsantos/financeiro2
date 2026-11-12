import { Metadata } from "next";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { PushTestPanel } from "./panel";

export const metadata: Metadata = {
  title: "Teste de Notificações Push | Mutano Contas",
  description: "Validação do Web Push PWA para iPhone e Android.",
};

export default async function PushTestPage() {
  await requireUserId();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações Push (PWA)"
        description="Ambiente de validação do Web Push nativo para iPhone (iOS 16.4+) e Android."
      />
      <PushTestPanel />
    </div>
  );
}
