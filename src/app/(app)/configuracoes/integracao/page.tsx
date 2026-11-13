import { requireProfileRoute } from "@/server/usage-profile";
import { getOpenFinanceSetup } from "@/server/actions/open-finance";
import { PageHeader } from "@/components/page-header";
import { IntegrationPanel } from "./panel";

export const metadata = { title: "Integração" };

export default async function IntegrationPage() {
  await requireProfileRoute("/configuracoes/integracao");
  const setup = await getOpenFinanceSetup();
  return (
    <>
      <PageHeader
        title="Integração"
        description="Conecte e sincronize suas contas bancárias automaticamente via Open Finance."
      />
      <IntegrationPanel initial={setup} />
    </>
  );
}
