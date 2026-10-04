import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getProfile, getUserReviews } from "@/lib/server/queries";
import { ReviewCard } from "@/components/social";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ sort?: string }> }) {
  const { username } = await params;
  const { sort = "recent" } = await searchParams;
  const viewer = await getViewer();
  const p = getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  if (!p.canView) return null;
  const reviews = getUserReviews(p.raw, sort, viewer?.id);
  return (
    <div className="max-w-3xl">
      <div className="flex items-end justify-between mb-4">
        <h2 className="display text-3xl">Reviews <span className="text-muted text-xl">{reviews.length}</span></h2>
        <div className="flex gap-3 text-[11px] uppercase tracking-wider">
          {[["recent", "Recent"], ["popular", "Popular"], ["rating", "Highest rated"]].map(([k, l]) => (
            <Link key={k} href={`?sort=${k}`} className={sort === k ? "text-fg" : "text-faint hover:text-muted"}>{l}</Link>
          ))}
        </div>
      </div>
      {reviews.length ? reviews.map((r) => <ReviewCard key={r.id} r={r} withSong />) : (
        <EmptyState icon="chat" title="No reviews yet" body={p.isSelf ? "Reviews can be a single sentence. Log a song and say what you think." : "When they write reviews, they'll appear here."} action={p.isSelf ? <Link href="/discover" className="btn-primary">Find something to review</Link> : undefined} />
      )}
    </div>
  );
}
