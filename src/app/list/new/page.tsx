import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { ListEditor } from "@/components/ListEditor";

export const metadata = { title: "New list" };

export default async function NewListPage() {
  if (!(await getViewer())) redirect("/login?next=/list/new");
  return <ListEditor />;
}
