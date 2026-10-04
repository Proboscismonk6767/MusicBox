import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { ListenLaterView } from "./ListenLaterView";
import { data } from "@/lib/server/data";

export const metadata = { title: "Listen Later" };

export default async function ListenLaterPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/listen-later");
  const items = await data.getListenLater(viewer.id);
  const states = await data.viewerStates(items.map((i) => i.song.id), viewer.id);
  return <ListenLaterView items={items} states={states} />;
}
