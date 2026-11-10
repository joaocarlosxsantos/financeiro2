import { requireUserId } from "@/lib/auth";
import { getUser } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { UserProfileForm } from "./profile-form";

export const metadata = { title: "Minha conta" };
export default async function UserPage() {
  const user = await getUser(await requireUserId());
  return <>
    <PageHeader title="Minha conta" description="Seu usuário e seu modo de usar o Mutano Contas." />
    <div className="max-w-xl space-y-6">
      <div className="border-b border-[var(--line)] pb-5"><p className="font-medium">{user.name}</p><p className="mt-1 break-words text-sm text-[var(--text-muted)]">{user.email}</p></div>
      <UserProfileForm profile={user.usageProfile} />
    </div>
  </>;
}
