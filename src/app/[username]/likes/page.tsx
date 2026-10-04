import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { SongTile } from "@/components/song-controls";
import { EmptyState, Stars } from "@/components/ui";
import { data } from "@/lib/server/data";

export const metadata = { title: "Liked songs" };

export default async function LikesPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getViewer();
  const p = await data.getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  if (!p.canView) return null;
  const likes = await data.getUserLikes(p.raw);
  const states = await data.viewerStates(likes.map((l) => l.song.id), viewer?.id);
  return (
    <div>
      <h2 className="display text-3xl mb-1">Hearts <span className="text-muted text-xl">{likes.length}</span></h2>
      <p className="text-sm text-muted mb-6">Personal favourites — separate from star ratings.</p>
      {likes.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
          {likes.map((l) => <SongTile key={l.song.id} song={l.song} state={states[l.song.id]} sub={<Stars rating={l.rating} size={9} />} />)}
        </div>
      ) : (
        <EmptyState icon="heart" title="No hearts yet" body="Heart a song when it means something to you — even if it's not a five-star song." action={p.isSelf ? <Link href="/discover" className="btn-primary">Discover songs</Link> : undefined} />
      )}
    </div>
  );
}
