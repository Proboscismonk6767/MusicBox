import type { Q } from "./driver";
import type { UserMini } from "../../views";
import { toUserMini } from "./hydrate";
import { hidden } from "./visibility";
import { byId, C, compatWith, ids } from "./helpers";

/** People worth following: taste match, mutual follows and popularity. The 300 most-followed candidates are scored (everyone, at today's size). */
export async function suggestedUsersFor(q: Q, viewerId: string | undefined, limit = 4): Promise<(UserMini & { reason: string; bio: string })[]> {
  const rows = await q.query(
    `select u.id, u.username::text as username, u.display_name, u.avatar_hue, u.avatar_url, u.bio,
            (select count(*)::int from follows f where f.following_id = u.id) as followers,
            case when $1::text is null then 0 else (select count(*)::int from follows f where f.following_id = u.id
              and f.follower_id in (select following_id from follows where follower_id = $1::text)) end as mutual
     from users u
     where ($1::text is null or u.id <> $1::text)
       and ($1::text is null or not exists (select 1 from follows f where f.follower_id = $1::text and f.following_id = u.id))
       and not u.suspended and u.profile_visibility = 'public' and not ${hidden("$1", "u.id")}
     order by followers desc, u.id ${C} limit 300`, [viewerId ?? null]);
  const comps = viewerId ? await compatWith(q, viewerId, ids(rows)) : null;
  return rows
    .map((r) => {
      const comp = comps?.get(r.id as string) ?? null;
      return { r, comp, s: (comp?.score ?? 50) + (r.mutual as number) * 6 + (r.followers as number) };
    })
    .sort((a, b) => b.s - a.s || byId(a.r.id as string, b.r.id as string))
    .slice(0, limit)
    .map(({ r, comp }) => ({
      ...toUserMini(r), bio: r.bio as string,
      reason: comp && comp.shared >= 3 ? `${comp.score}% taste match` : (r.mutual as number) ? `Followed by ${r.mutual} you follow` : `${r.followers} followers`,
    }));
}
