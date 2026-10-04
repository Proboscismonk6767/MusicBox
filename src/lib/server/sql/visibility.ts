// SQL for "can this viewer see this?". Each function returns a boolean SQL expression
// and takes the SQL text of the viewer parameter (for example "$1"; NULL when signed out)
// and of the row being tested. They are the Postgres twins of visibleUser(), isHidden(),
// entryOk() and listOk() in queries.ts and must stay in step with them.

/** The viewer blocked or muted the user, or the user blocked the viewer. */
export const hidden = (viewer: string, userId: string) =>
  `(${viewer}::text is not null and exists (select 1 from user_blocks b where (b.user_id = ${viewer}::text and b.target_id = ${userId}) or (b.kind = 'block' and b.user_id = ${userId} and b.target_id = ${viewer}::text)))`;

/** `u` is a users row alias. Suspended accounts are never visible; private profiles only to their owner; follower-only profiles to followers. */
export const visibleUser = (u: string, viewer: string) =>
  `(not ${u}.suspended and (coalesce(${u}.id = ${viewer}::text, false) or ${u}.profile_visibility = 'public' or (${u}.profile_visibility = 'followers' and ${viewer}::text is not null and exists (select 1 from follows vf where vf.follower_id = ${viewer}::text and vf.following_id = ${u}.id))))`;

/** `e` is a diary_entries alias, `u` the author's users alias. */
export const entryOk = (e: string, u: string, viewer: string) => `(not ${e}.removed and ${visibleUser(u, viewer)} and not ${hidden(viewer, `${e}.user_id`)})`;

/** `l` is a lists alias, `u` the owner's users alias. Matches listOk(): not removed, not someone else's private list, owner visible and not hidden. */
export const listOk = (l: string, u: string, viewer: string) =>
  `(not ${l}.removed and (${l}.visibility <> 'private' or ${l}.user_id = ${viewer}::text) and ${visibleUser(u, viewer)} and not ${hidden(viewer, `${l}.user_id`)})`;
