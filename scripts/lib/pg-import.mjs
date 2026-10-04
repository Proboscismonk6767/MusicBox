// Loads a MusicBox JSON document (data/db.json) into the Postgres schema in
// db/schema.sql. Works with any client that can run `query(sql, params)`:
// node-postgres in production, PGlite in tests and in the --dry-run check.
//
// Rows that point at something that no longer exists (an activity event for a
// deleted entry, say) are skipped and counted rather than failing the whole
// import; the report tells you exactly how many, per table.

const BATCH = 2000;

const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const day = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
const bool = (v) => !!v;

/**
 * @param {any} db  the parsed data/db.json
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} query
 * @returns {Promise<{ inserted: Record<string, number>, skipped: Record<string, number> }>}
 */
export async function importDb(db, query) {
  const inserted = {};
  const skipped = {};

  /** One INSERT … SELECT FROM jsonb_to_recordset per batch: fast, and one parameter per statement. */
  async function bulk(table, cols, rows) {
    inserted[table] = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const names = cols.map(([n]) => n).join(", ");
      const typed = cols.map(([n, t]) => `${n} ${t}`).join(", ");
      await query(`insert into ${table} (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as x(${typed})`, [JSON.stringify(chunk)]);
      inserted[table] += chunk.length;
    }
  }

  /** Keep rows whose references all exist; count the rest. */
  function keep(table, rows, ...checks) {
    const ok = rows.filter((r) => checks.every(([key, set, nullable]) => (nullable && r[key] == null) || set.has(r[key])));
    if (ok.length !== rows.length) skipped[table] = (skipped[table] ?? 0) + rows.length - ok.length;
    return ok;
  }

  // ── Catalogue ─────────────────────────────────────────────────────────
  const artistIds = new Set();
  const artists = db.artists.map((a) => (artistIds.add(a.id), { id: a.id, external_id: a.externalId ?? null, slug: a.slug, name: a.name, image_url: a.imageUrl ?? null, genres: arr(a.genres), hue: a.hue ?? 0, bio: a.bio ?? null }));
  await bulk("artists", [["id", "text"], ["external_id", "text"], ["slug", "text"], ["name", "text"], ["image_url", "text"], ["genres", "text[]"], ["hue", "int"], ["bio", "text"]], artists);

  const albumIds = new Set();
  const albums = keep("albums", db.albums.map((a) => (albumIds.add(a.id), {
    id: a.id, external_id: a.externalId ?? null, slug: a.slug, artist_id: a.artistId, title: a.title, release_date: day(a.releaseDate),
    genres: arr(a.genres), label: a.label ?? null, artwork_url: a.artworkUrl ?? null, palette: arr(a.palette), pattern: a.pattern ?? 0, producers: arr(a.producers),
  })), ["artist_id", artistIds]);
  await bulk("albums", [["id", "text"], ["external_id", "text"], ["slug", "text"], ["artist_id", "text"], ["title", "text"], ["release_date", "date"], ["genres", "text[]"], ["label", "text"], ["artwork_url", "text"], ["palette", "text[]"], ["pattern", "int"], ["producers", "text[]"]], albums);

  const songIds = new Set();
  const songRows = keep("songs", db.songs.map((s) => (songIds.add(s.id), {
    id: s.id, external_id: s.externalId ?? null, slug: s.slug, album_id: s.albumId, title: s.title, featured: arr(s.featured), duration_ms: s.durationMs ?? 0,
    track_number: s.trackNumber ?? null, release_date: day(s.releaseDate), isrc: s.isrc ?? null, explicit: bool(s.explicit), writers: arr(s.writers), producers: arr(s.producers),
    genres: arr(s.genres), popularity: s.popularity ?? null, preview_url: s.previewUrl ?? null, links: s.links ?? {},
  })), ["album_id", albumIds]);
  await bulk("songs", [["id", "text"], ["external_id", "text"], ["slug", "text"], ["album_id", "text"], ["title", "text"], ["featured", "text[]"], ["duration_ms", "int"], ["track_number", "int"], ["release_date", "date"], ["isrc", "text"], ["explicit", "boolean"], ["writers", "text[]"], ["producers", "text[]"], ["genres", "text[]"], ["popularity", "int"], ["preview_url", "text"], ["links", "jsonb"]], songRows);

  const songArtists = keep("song_artists", db.songs.flatMap((s) => s.artistIds.map((a, position) => ({ song_id: s.id, artist_id: a, position }))), ["song_id", songIds], ["artist_id", artistIds]);
  await bulk("song_artists", [["song_id", "text"], ["artist_id", "text"], ["position", "int"]], songArtists);

  // ── People ────────────────────────────────────────────────────────────
  const userIds = new Set();
  const users = db.users.map((u) => (userIds.add(u.id), {
    id: u.id, username: u.username, display_name: u.displayName, bio: u.bio ?? "", location: u.location ?? null, website: u.website ?? null,
    avatar_hue: u.avatarHue ?? 0, avatar_url: u.avatarUrl ?? null, password_hash: u.passwordHash, created_at: iso(u.createdAt) ?? new Date().toISOString(),
    favorite_song_ids: arr(u.favoriteSongIds), favorite_artist_ids: arr(u.favoriteArtistIds),
    profile_lyric_song_id: u.profileLyric && songIds.has(u.profileLyric.songId) ? u.profileLyric.songId : null,
    profile_lyric_text: u.profileLyric && songIds.has(u.profileLyric.songId) ? u.profileLyric.text : null,
    profile_lyric_start_ms: u.profileLyric?.startMs ?? null, profile_lyric_updated_at: iso(u.profileLyric?.updatedAt),
    profile_visibility: u.profileVisibility ?? "public", role: u.role ?? "user", suspended: bool(u.suspended), onboarded: bool(u.onboarded),
  }));
  await bulk("users", [["id", "text"], ["username", "text"], ["display_name", "text"], ["bio", "text"], ["location", "text"], ["website", "text"], ["avatar_hue", "int"], ["avatar_url", "text"], ["password_hash", "text"], ["created_at", "timestamptz"], ["favorite_song_ids", "text[]"], ["favorite_artist_ids", "text[]"], ["profile_lyric_song_id", "text"], ["profile_lyric_text", "text"], ["profile_lyric_start_ms", "int"], ["profile_lyric_updated_at", "timestamptz"], ["profile_visibility", "text"], ["role", "text"], ["suspended", "boolean"], ["onboarded", "boolean"]], users);

  const now = Date.now();
  const sessions = keep("sessions", (db.sessions ?? []).filter((s) => Date.parse(s.expiresAt) > now).map((s) => ({ token_hash: s.tokenHash, user_id: s.userId, created_at: iso(s.createdAt) ?? new Date().toISOString(), expires_at: s.expiresAt })), ["user_id", userIds]);
  await bulk("sessions", [["token_hash", "text"], ["user_id", "text"], ["created_at", "timestamptz"], ["expires_at", "timestamptz"]], sessions);

  // ── Activity ──────────────────────────────────────────────────────────
  const ratings = keep("ratings", db.ratings.map((r) => ({ user_id: r.userId, song_id: r.songId, rating: r.rating, created_at: iso(r.createdAt) ?? new Date().toISOString(), updated_at: iso(r.updatedAt) ?? new Date().toISOString() })), ["user_id", userIds], ["song_id", songIds]);
  const likes = keep("likes", db.likes.map((l) => ({ user_id: l.userId, song_id: l.songId, created_at: iso(l.createdAt) ?? new Date().toISOString() })), ["user_id", userIds], ["song_id", songIds]);

  const entryIds = new Set();
  const entries = keep("diary_entries", db.entries.map((e) => (entryIds.add(e.id), {
    id: e.id, user_id: e.userId, song_id: e.songId, rating_at_time: e.rating ?? null, liked: bool(e.liked), review_text: e.review ?? null, has_spoiler: bool(e.hasSpoiler),
    listened_at: day(e.listenedAt) ?? String(e.createdAt).slice(0, 10), is_relisten: bool(e.isRelisten), tags: arr(e.tags), context: e.context ?? null, memory: e.memory ?? null,
    removed: bool(e.removed), created_at: iso(e.createdAt) ?? new Date().toISOString(), updated_at: iso(e.updatedAt) ?? iso(e.createdAt) ?? new Date().toISOString(),
  })), ["user_id", userIds], ["song_id", songIds]);
  const keptEntries = new Set(entries.map((e) => e.id));

  // Inserted after entries so triggers see the final state; one stats refresh per row, fine at this size.
  await bulk("ratings", [["user_id", "text"], ["song_id", "text"], ["rating", "numeric"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"]], ratings);
  await bulk("likes", [["user_id", "text"], ["song_id", "text"], ["created_at", "timestamptz"]], likes);
  await bulk("diary_entries", [["id", "text"], ["user_id", "text"], ["song_id", "text"], ["rating_at_time", "numeric"], ["liked", "boolean"], ["review_text", "text"], ["has_spoiler", "boolean"], ["listened_at", "date"], ["is_relisten", "boolean"], ["tags", "text[]"], ["context", "text"], ["memory", "text"], ["removed", "boolean"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"]], entries);

  await bulk("review_likes", [["user_id", "text"], ["entry_id", "text"], ["created_at", "timestamptz"]],
    keep("review_likes", db.reviewLikes.map((l) => ({ user_id: l.userId, entry_id: l.entryId, created_at: iso(l.createdAt) ?? new Date().toISOString() })), ["user_id", userIds], ["entry_id", keptEntries]));
  await bulk("follows", [["follower_id", "text"], ["following_id", "text"], ["created_at", "timestamptz"]],
    keep("follows", db.follows.filter((f) => f.followerId !== f.followingId).map((f) => ({ follower_id: f.followerId, following_id: f.followingId, created_at: iso(f.createdAt) ?? new Date().toISOString() })), ["follower_id", userIds], ["following_id", userIds]));
  await bulk("artist_follows", [["user_id", "text"], ["artist_id", "text"], ["created_at", "timestamptz"]],
    keep("artist_follows", db.artistFollows.map((f) => ({ user_id: f.userId, artist_id: f.artistId, created_at: iso(f.createdAt) ?? new Date().toISOString() })), ["user_id", userIds], ["artist_id", artistIds]));

  const listIds = new Set();
  const lists = keep("lists", db.lists.map((l) => (listIds.add(l.id), {
    id: l.id, user_id: l.userId, title: l.title, description: l.description ?? "", is_ranked: bool(l.isRanked), visibility: l.visibility ?? "public",
    cloned_from_id: l.clonedFromId ?? null, removed: bool(l.removed), created_at: iso(l.createdAt) ?? new Date().toISOString(), updated_at: iso(l.updatedAt) ?? iso(l.createdAt) ?? new Date().toISOString(),
  })), ["user_id", userIds]);
  const keptLists = new Set(lists.map((l) => l.id));
  for (const l of lists) if (l.cloned_from_id && !keptLists.has(l.cloned_from_id)) l.cloned_from_id = null;
  await bulk("lists", [["id", "text"], ["user_id", "text"], ["title", "text"], ["description", "text"], ["is_ranked", "boolean"], ["visibility", "text"], ["cloned_from_id", "text"], ["removed", "boolean"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"]], lists);
  await bulk("list_items", [["list_id", "text"], ["position", "int"], ["song_id", "text"], ["note", "text"]],
    keep("list_items", db.lists.filter((l) => keptLists.has(l.id)).flatMap((l) => l.items.map((it, position) => ({ list_id: l.id, position, song_id: it.songId, note: it.note ?? null }))), ["song_id", songIds]));
  await bulk("list_likes", [["user_id", "text"], ["list_id", "text"], ["created_at", "timestamptz"]],
    keep("list_likes", db.listLikes.map((l) => ({ user_id: l.userId, list_id: l.listId, created_at: iso(l.createdAt) ?? new Date().toISOString() })), ["user_id", userIds], ["list_id", keptLists]));

  const commentRows = keep("comments", db.comments.map((c) => ({ id: c.id, user_id: c.userId, target_type: c.targetType, target_id: c.targetId, parent_id: c.parentId ?? null, body: c.body, removed: bool(c.removed), created_at: iso(c.createdAt) ?? new Date().toISOString() })), ["user_id", userIds]);
  const commentIds = new Set(commentRows.map((c) => c.id));
  // A reply whose parent is gone becomes a top-level comment rather than being lost.
  for (const c of commentRows) if (c.parent_id && !commentIds.has(c.parent_id)) c.parent_id = null;
  await bulk("comments", [["id", "text"], ["user_id", "text"], ["target_type", "text"], ["target_id", "text"], ["parent_id", "text"], ["body", "text"], ["removed", "boolean"], ["created_at", "timestamptz"]], commentRows);
  await bulk("comment_likes", [["user_id", "text"], ["comment_id", "text"]],
    keep("comment_likes", db.commentLikes.map((l) => ({ user_id: l.userId, comment_id: l.commentId })), ["user_id", userIds], ["comment_id", commentIds]));

  await bulk("listen_later", [["user_id", "text"], ["song_id", "text"], ["created_at", "timestamptz"]],
    keep("listen_later", db.listenLater.map((l) => ({ user_id: l.userId, song_id: l.songId, created_at: iso(l.createdAt) ?? new Date().toISOString() })), ["user_id", userIds], ["song_id", songIds]));
  await bulk("notifications", [["id", "text"], ["user_id", "text"], ["actor_id", "text"], ["type", "text"], ["target_id", "text"], ["read_at", "timestamptz"], ["created_at", "timestamptz"]],
    keep("notifications", db.notifications.map((n) => ({ id: n.id, user_id: n.userId, actor_id: n.actorId, type: n.type, target_id: n.targetId ?? null, read_at: iso(n.readAt), created_at: iso(n.createdAt) ?? new Date().toISOString() })), ["user_id", userIds], ["actor_id", userIds]));
  await bulk("activity_events", [["id", "text"], ["actor_id", "text"], ["event_type", "text"], ["song_id", "text"], ["list_id", "text"], ["entry_id", "text"], ["target_user_id", "text"], ["count", "int"], ["created_at", "timestamptz"]],
    keep("activity_events", db.activity.map((a) => ({ id: a.id, actor_id: a.actorId, event_type: a.type, song_id: a.songId ?? null, list_id: a.listId ?? null, entry_id: a.entryId ?? null, target_user_id: a.targetUserId ?? null, count: a.count ?? null, created_at: iso(a.createdAt) ?? new Date().toISOString() })),
      ["actor_id", userIds], ["song_id", songIds, true], ["list_id", keptLists, true], ["entry_id", keptEntries, true], ["target_user_id", userIds, true]));
  await bulk("reports", [["id", "text"], ["reporter_id", "text"], ["target_type", "text"], ["target_id", "text"], ["reason", "text"], ["status", "text"], ["created_at", "timestamptz"]],
    keep("reports", db.reports.map((r) => ({ id: r.id, reporter_id: r.reporterId, target_type: r.targetType, target_id: r.targetId, reason: r.reason, status: r.status, created_at: iso(r.createdAt) ?? new Date().toISOString() })), ["reporter_id", userIds]));
  await bulk("user_blocks", [["user_id", "text"], ["target_id", "text"], ["kind", "text"]],
    keep("user_blocks", db.blocks.map((b) => ({ user_id: b.userId, target_id: b.targetId, kind: b.kind })), ["user_id", userIds], ["target_id", userIds]));

  return { inserted, skipped };
}

/** Compares what is in Postgres with the source document. Returns a list of problems (empty = identical). */
export async function verifyImport(db, query) {
  const rows = async (sql) => {
    const r = await query(sql);
    return r.rows ?? r;
  };
  const problems = [];
  const count = async (table) => Number((await rows(`select count(*)::int as n from ${table}`))[0].n);
  const expect = async (table, want) => {
    const got = await count(table);
    if (got !== want) problems.push(`${table}: expected ${want} rows, found ${got}`);
  };
  await expect("users", db.users.length);
  await expect("artists", db.artists.length);
  await expect("albums", db.albums.length);
  await expect("songs", db.songs.length);

  // The triggers must reproduce the aggregation table the app maintains by hand.
  const stats = await rows("select song_id, rating_count, rating_sum::float8 as rating_sum, histogram, log_count, review_count, like_count from song_stats");
  const bySong = new Map(stats.map((s) => [s.song_id, s]));
  for (const [songId, want] of Object.entries(db.songStats ?? {})) {
    const got = bySong.get(songId);
    if (!got) { problems.push(`song_stats: missing ${songId}`); continue; }
    const same = got.rating_count === want.ratingCount && Math.abs(got.rating_sum - want.ratingSum) < 1e-6 && got.log_count === want.logCount && got.review_count === want.reviewCount && got.like_count === want.likeCount && JSON.stringify(got.histogram) === JSON.stringify(want.histogram);
    if (!same) problems.push(`song_stats: ${songId} differs (db: ${JSON.stringify(got)}, app: ${JSON.stringify(want)})`);
  }
  return problems;
}
