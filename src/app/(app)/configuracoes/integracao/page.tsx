import { requireUserId } from "@/lib/auth";
import { getOpenFinanceSetup } from "@/server/actions/open-finance";
import { PageHeader } from "@/components/page-header";
import { IntegrationPanel } from "./panel";

export const metadata = { title: "Integração" };
export default async function IntegrationPage() {
  await requireUserId();
  const setup = await getOpenFinanceSetup();
  return <><PageHeader title="Integração" description="Conecte suas contas Pluggy e escolha quais contas locais serão alimentadas automaticamente." /><IntegrationPanel initial={setup} /></>;
}
