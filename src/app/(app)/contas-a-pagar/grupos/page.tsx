import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { isSharedSchemaMissing, listSharedGroups, SHARED_GROUP_PATH } from "@/server/shared-groups";
import { CreateSharedGroup } from "./group-forms";

export const metadata = { title: "Grupos e acertos" };

export default async function SharedGroupsPage() {
  const userId = await requireUserId();
  const groups = await listSharedGroups(userId).catch((error: unknown) => {
    if (isSharedSchemaMissing(error)) return null;
    throw error;
  });
  return <>
    <Link href="/contas-a-pagar" className="mb-2 inline-flex min-h-11 items-center text-sm text-[var(--text-brand)] underline">Contas a pagar</Link>
    <PageHeader title="Grupos e acertos" description="Divida despesas e acompanhe os acertos da casa." action={groups && <CreateSharedGroup />} />
    {groups === null ? <p role="status" className="muted text-sm">Os grupos estarão disponíveis após a atualização do banco.</p>
      : groups.length === 0 ? <p className="muted text-sm">Crie um grupo com as pessoas que dividem despesas com você.</p>
      : <ul className="grid gap-3 sm:grid-cols-2">{groups.map((group) => <li key={group.id}>
        <Link href={`${SHARED_GROUP_PATH}/${group.id}`} className="card flex min-h-14 min-w-0 items-center justify-between gap-3 p-4 focus-visible:outline-2 focus-visible:outline-[var(--acento)]">
          <span className="min-w-0 break-words font-medium">{group.name}</span><span className="shrink-0 text-sm text-[var(--text-brand)]">Abrir</span>
        </Link>
      </li>)}</ul>}
  </>;
}
