import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getListenLater, viewerStates } from "@/lib/server/queries";
import { ListenLaterView } from "./ListenLaterView";

export const metadata = { title: "Listen Later" };

export default async function ListenLaterPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/listen-later");
  const items = getListenLater(viewer.id);
  const states = viewerStates(items.map((i) => i.song.id), viewer.id);
  return <ListenLaterView items={items} states={states} />;
}
