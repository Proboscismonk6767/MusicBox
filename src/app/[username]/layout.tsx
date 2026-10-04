import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { Avatar, Icon } from "@/components/ui";
import { FollowButton, BlockMuteButtons, ReportButton } from "@/components/social";
import { ProfileTabs } from "./ProfileTabs";
import { ProfileMenu } from "./ProfileMenu";
import { ProfileLyric } from "./ProfileLyric";
import { data } from "@/lib/server/data";

type Props = { params: Promise<{ username: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const p = await data.getProfile((await params).username);
  if (!p) return { title: "User not found" };
  return { title: `${p.user.displayName} (@${p.user.username})`, description: p.user.bio || `${p.user.displayName}'s music diary on MusicBox: ${p.counts.logged} songs logged.` };
}

export default async function ProfileLayout({ params, children }: Props) {
  const { username } = await params;
  const viewer = await getViewer();
  const p = await data.getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  const { user, counts } = p;
  const showLyric = !!p.lyric || p.isSelf;
  return (
    <div>
      <header className={`flex flex-col sm:flex-row sm:flex-wrap ${showLyric ? "" : "xl:flex-nowrap"} sm:items-center gap-5 mb-6`}>
        <Avatar user={user} size={96} className="ring-4 ring-elev" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-4xl leading-none">{user.displayName}</h1>
            {p.isSelf ? <Link href="/settings" className="btn-secondary btn-sm">Edit profile</Link> : viewer && !p.blocked && <FollowButton userId={user.id} following={p.viewerFollows} size="sm" />}
            {p.followsViewer && <span className="text-[11px] uppercase tracking-wider text-faint">Follows you</span>}
            {viewer && !p.isSelf && (
              <ProfileMenu>
                <BlockMuteButtons userId={user.id} blocked={p.blocked} muted={p.muted} />
                <div className="px-2.5 py-1.5"><ReportButton targetType="user" targetId={user.id} label="Report user" /></div>
              </ProfileMenu>
            )}
          </div>
          <div className="text-sm text-muted mt-1.5">@{user.username}{user.location && <> · {user.location}</>}{user.website && <> · <a href={user.website} target="_blank" rel="noopener noreferrer nofollow ugc" className="hover:text-accent">{user.website.replace(/^https?:\/\//, "")}</a></>}</div>
          {user.bio && <p className="text-sm text-fg/85 mt-2 max-w-xl">{user.bio}</p>}
          {p.compatibility && p.compatibility.shared > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs">
              <Icon name="sparkle" size={13} className="text-accent" />
              You and @{user.username} have <span className="font-semibold text-accent">{p.compatibility.score}%</span> compatible taste
              <span className="text-faint">· {p.compatibility.shared} songs in common</span>
            </div>
          )}
        </div>
        {showLyric && <ProfileLyric lyric={p.lyric} isSelf={p.isSelf} />}
        <dl className={`grid grid-cols-5 sm:flex gap-x-6 gap-y-2 text-center shrink-0 sm:basis-full ${showLyric ? "" : "xl:text-right xl:basis-auto"}`}>
          {[
            ["Logged", counts.logged, `/${user.username}/diary`],
            ["Reviews", counts.reviews, `/${user.username}/reviews`],
            ["Lists", counts.lists, `/${user.username}/lists`],
            ["Followers", counts.followers, `/${user.username}/followers`],
            ["Following", counts.following, `/${user.username}/following`],
          ].map(([l, n, href]) => (
            <Link key={l as string} href={href as string} className="group sm:border-l sm:border-line sm:pl-6 first:border-0 first:pl-0">
              <dd className="text-xl font-semibold tabular-nums group-hover:text-accent">{(n as number).toLocaleString()}</dd>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">{l}</dt>
            </Link>
          ))}
        </dl>
      </header>
      <ProfileTabs username={user.username} isSelf={p.isSelf} />
      {p.canView ? children : (
        <div className="py-20 text-center">
          <Icon name="shield" size={28} className="mx-auto text-faint mb-3" />
          <h2 className="display text-2xl">This profile is private</h2>
          <p className="text-sm text-muted mt-1">{p.blocked ? "You've blocked this account." : "Follow this account to see their diary, reviews and lists."}</p>
        </div>
      )}
    </div>
  );
}
