import { requireProfileRoute } from "@/server/usage-profile";
import { getOpenFinanceSetup } from "@/server/actions/open-finance";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { IntegrationPanel } from "./panel";

export const metadata = { title: "Integração" };

export default async function IntegrationPage() {
  const userId = await requireUserId();
  await requireProfileRoute("/configuracoes/integracao");
  const setup = await getOpenFinanceSetup();
  return (
    <>
      <PageHeader
        title="Integração"
        description="Conecte e sincronize suas contas bancárias automaticamente via Open Finance."
      />
      <IntegrationPanel initial={setup} userId={userId} />
    </>
  );
}
