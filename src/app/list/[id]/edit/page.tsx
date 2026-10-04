import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getListPage } from "@/lib/server/queries";
import { ListEditor } from "@/components/ListEditor";

export const metadata = { title: "Edit list" };

export default async function EditListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/list/${id}/edit`);
  const p = getListPage(id, viewer.id);
  if (!p) notFound();
  if (!p.isOwner) redirect(`/list/${id}`);
  const { list } = p;
  return <ListEditor initial={{ id: list.id, title: list.title, description: list.description, isRanked: list.isRanked, visibility: list.visibility, items: p.items }} />;
}
