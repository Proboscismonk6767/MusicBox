import { getDB, mutate } from "@/lib/server/store";
import { recomputeAllStats } from "@/lib/server/stats";

/** The demo seed has no private profiles, blocks, removed content or reports. Add them, in the JSON store, so the
 *  parity tests exercise every visibility rule. Call once, before copying the data anywhere else. */
export function applyEdgeCases() {
  const db = getDB();
  const song = (n: number) => db.songs[n].id;
  mutate((d) => {
    const find = (name: string) => d.users.find((x) => x.username === name)!;
    find("priya").profileVisibility = "private";
    find("theo").profileVisibility = "followers";
    find("kai").suspended = true;
    d.blocks.push({ userId: find("maya").id, targetId: find("daniel").id, kind: "block" }, { userId: find("alex").id, targetId: find("sam").id, kind: "mute" });
    const rosa = d.entries.find((e) => e.userId === find("rosa").id && e.review)!;
    rosa.removed = true;
    const lists = d.lists;
    lists[0].removed = true;
    lists[1].visibility = "private";
    lists[2].visibility = "unlisted";
    find("abtin").profileLyric = { songId: song(3), text: "a line", startMs: 1200, updatedAt: "2026-01-01T00:00:00.000Z" };
    find("alex").profileLyric = { songId: song(5), text: "another line", updatedAt: "2026-01-02T00:00:00.000Z" };
    const withReview = d.entries.filter((e) => e.review && !e.removed);
    withReview[0].hasSpoiler = true;
    const parent = d.comments[0];
    d.comments.push({ id: "co_reply1", userId: find("alex").id, targetType: parent.targetType, targetId: parent.targetId, parentId: parent.id, body: "reply one", createdAt: "2026-02-01T00:00:00.000Z" });
    d.comments.push({ id: "co_reply2", userId: find("maya").id, targetType: parent.targetType, targetId: parent.targetId, parentId: parent.id, body: "reply two", createdAt: "2026-02-02T00:00:00.000Z" });
    d.comments.push({ id: "co_gone", userId: find("sam").id, targetType: parent.targetType, targetId: parent.targetId, body: "removed one", createdAt: "2026-02-03T00:00:00.000Z", removed: true });
    d.commentLikes.push({ userId: find("alex").id, commentId: parent.id }, { userId: find("abtin").id, commentId: "co_reply1" });
    // Reports to moderate, and catalogue ids on a few items so the importer lookups have something to find.
    const entryWithReview = d.entries.find((e) => e.review && !e.removed)!;
    d.reports.push(
      { id: "re_a", reporterId: find("alex").id, targetType: "entry", targetId: entryWithReview.id, reason: "rude", status: "open", createdAt: "2026-03-01T10:00:00.000Z" },
      { id: "re_b", reporterId: find("maya").id, targetType: "comment", targetId: "co_reply1", reason: "spam", status: "open", createdAt: "2026-03-02T10:00:00.000Z" },
      { id: "re_c", reporterId: find("sam").id, targetType: "list", targetId: d.lists[3].id, reason: "off topic", status: "resolved", createdAt: "2026-03-03T10:00:00.000Z" },
      { id: "re_d", reporterId: find("noor").id, targetType: "user", targetId: find("daniel").id, reason: "harassment", status: "dismissed", createdAt: "2026-03-04T10:00:00.000Z" },
      { id: "re_e", reporterId: find("noor").id, targetType: "entry", targetId: "en_gone", reason: "gone", status: "open", createdAt: "2026-03-05T10:00:00.000Z" },
    );
    d.songs[10].externalId = "mb:song-ten";
    d.albums[3].externalId = "mb:album-three";
    d.artists[4].externalId = "mb:artist-four";
    recomputeAllStats(d);
  });
}
