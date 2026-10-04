-- MusicBox: PostgreSQL schema (v2). Mirrors src/lib/types.ts exactly.
--
-- Status: verified by tests/postgres.test.ts, which applies this file to a real
-- Postgres (PGlite) and loads the full app data set into it. The app itself still
-- runs on the JSON store (src/lib/server/store.ts); moving the read/write layer
-- to this schema is the remaining step (see ROADMAP.md, Phase 0).
--
-- Design notes
--  • Primary keys are TEXT, the same ids the app already generates ("us1a2b…",
--    "so0009i", "en0009b"). They appear in public URLs (/review/en0009b), so
--    keeping them means no link ever breaks when the data moves.
--  • Aggregates (song_stats) are maintained by triggers and never computed per
--    request. refresh_song_stats() recomputes one song from its source rows, so
--    it is always exactly right; if one song gets very hot, swap it for an
--    incremental update.
--  • "removed" flags are moderator soft-deletes, as in the app.

create extension if not exists pg_trgm;
create extension if not exists citext;

-- ── Catalogue ───────────────────────────────────────────────────────────

create table artists (
  id          text primary key,
  external_id text unique,                 -- "mb:<uuid>" or "itunes:<n>"
  slug        text unique not null,
  name        text not null,
  image_url   text,
  genres      text[] not null default '{}',
  hue         smallint not null default 0,
  bio         text
);
create index artists_name_trgm on artists using gin (name gin_trgm_ops);

create table albums (
  id           text primary key,
  external_id  text unique,
  slug         text unique not null,
  artist_id    text not null references artists(id),
  title        text not null,
  release_date date,
  genres       text[] not null default '{}',
  label        text,
  artwork_url  text,
  palette      text[] not null default '{}',   -- three CSS colours used for generated covers
  pattern      smallint not null default 0,
  producers    text[] not null default '{}'
);
create index albums_artist on albums(artist_id);
create index albums_title_trgm on albums using gin (title gin_trgm_ops);

create table songs (
  id           text primary key,
  external_id  text unique,
  slug         text unique not null,
  album_id     text not null references albums(id),
  title        text not null,
  featured     text[] not null default '{}',   -- names of featured artists
  duration_ms  int not null default 0,
  track_number int,
  release_date date,
  isrc         text,
  explicit     boolean not null default false,
  writers      text[] not null default '{}',
  producers    text[] not null default '{}',
  genres       text[] not null default '{}',
  popularity   smallint,
  preview_url  text,
  links        jsonb not null default '{}'
);
create index songs_album on songs(album_id);
create index songs_isrc on songs(isrc);
create index songs_title_trgm on songs using gin (title gin_trgm_ops);
create index songs_genres on songs using gin (genres);

create table song_artists (
  song_id   text not null references songs(id) on delete cascade,
  artist_id text not null references artists(id) on delete cascade,
  position  smallint not null default 0,
  primary key (song_id, artist_id)
);
create index song_artists_artist on song_artists(artist_id);

-- ── People ──────────────────────────────────────────────────────────────

create table users (
  id                 text primary key,
  username           citext unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name       text not null,
  bio                text not null default '',
  location           text,
  website            text,
  avatar_hue         smallint not null default 0,
  avatar_url         text,
  password_hash      text not null,
  created_at         timestamptz not null default now(),
  favorite_song_ids   text[] not null default '{}',
  favorite_artist_ids text[] not null default '{}',
  profile_lyric_song_id    text references songs(id) on delete set null,
  profile_lyric_text       text check (char_length(profile_lyric_text) <= 300),
  profile_lyric_start_ms   int,
  profile_lyric_updated_at timestamptz,
  profile_visibility text not null default 'public' check (profile_visibility in ('public','followers','private')),
  role               text not null default 'user' check (role in ('user','admin')),
  suspended          boolean not null default false,
  onboarded          boolean not null default false
);

-- Only the SHA-256 of the cookie token is stored; the raw token never is.
create table sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions(user_id);
create index sessions_expiry on sessions(expires_at);

-- ── What people do ──────────────────────────────────────────────────────

-- Current opinion of a song (one per user and song).
create table ratings (
  user_id    text not null references users(id) on delete cascade,
  song_id    text not null references songs(id) on delete cascade,
  rating     numeric(2,1) not null check (rating >= 0.5 and rating <= 5 and rating * 2 = floor(rating * 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
create index ratings_song on ratings(song_id);

create table likes (
  user_id    text not null references users(id) on delete cascade,
  song_id    text not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
create index likes_song on likes(song_id);

-- One listening experience (repeatable). Reviews live here.
create table diary_entries (
  id             text primary key,
  user_id        text not null references users(id) on delete cascade,
  song_id        text not null references songs(id) on delete cascade,
  rating_at_time numeric(2,1),
  liked          boolean not null default false,
  review_text    text,
  has_spoiler    boolean not null default false,
  listened_at    date not null,
  is_relisten    boolean not null default false,
  tags           text[] not null default '{}',
  context        text check (context in ('headphones','car','concert','party','vinyl','radio','other')),
  memory         text,
  removed        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index diary_user_date on diary_entries(user_id, listened_at desc);
create index diary_song on diary_entries(song_id) where not removed;
create index diary_reviews on diary_entries(song_id, created_at desc) where review_text is not null and not removed;
create index diary_tags on diary_entries using gin (tags);

create table review_likes (
  user_id    text not null references users(id) on delete cascade,
  entry_id   text not null references diary_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);
create index review_likes_entry on review_likes(entry_id);

create table follows (
  follower_id  text not null references users(id) on delete cascade,
  following_id text not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following on follows(following_id);

create table artist_follows (
  user_id    text not null references users(id) on delete cascade,
  artist_id  text not null references artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

create table lists (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  title       text not null,
  description text not null default '',
  is_ranked   boolean not null default false,
  visibility  text not null default 'public' check (visibility in ('public','unlisted','private')),
  cloned_from_id text references lists(id) on delete set null,
  removed     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index lists_user on lists(user_id, updated_at desc);

create table list_items (
  list_id  text not null references lists(id) on delete cascade,
  position int not null,
  song_id  text not null references songs(id) on delete cascade,
  note     text,
  primary key (list_id, position)
);
create index list_items_song on list_items(song_id);

create table list_likes (
  user_id    text not null references users(id) on delete cascade,
  list_id    text not null references lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, list_id)
);

create table comments (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  target_type text not null check (target_type in ('entry','list')),
  target_id   text not null,
  parent_id   text references comments(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  removed     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index comments_target on comments(target_type, target_id, created_at);

create table comment_likes (
  user_id    text not null references users(id) on delete cascade,
  comment_id text not null references comments(id) on delete cascade,
  primary key (user_id, comment_id)
);

create table listen_later (
  user_id    text not null references users(id) on delete cascade,
  song_id    text not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create table notifications (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  actor_id   text not null references users(id) on delete cascade,
  type       text not null,
  target_id  text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications(user_id, created_at desc);
create index notifications_unread on notifications(user_id) where read_at is null;

create table activity_events (
  id             text primary key,
  actor_id       text not null references users(id) on delete cascade,
  event_type     text not null check (event_type in ('song_logged','song_reviewed','song_liked','song_rated','list_created','list_updated','user_followed')),
  song_id        text references songs(id) on delete cascade,
  list_id        text references lists(id) on delete cascade,
  entry_id       text references diary_entries(id) on delete cascade,
  target_user_id text references users(id) on delete cascade,
  count          int,
  created_at     timestamptz not null default now()
);
create index activity_actor_time on activity_events(actor_id, created_at desc);

create table reports (
  id          text primary key,
  reporter_id text not null references users(id) on delete cascade,
  target_type text not null check (target_type in ('entry','comment','list','user')),
  target_id   text not null,
  reason      text not null,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);
create index reports_open on reports(created_at) where status = 'open';

create table user_blocks (
  user_id   text not null references users(id) on delete cascade,
  target_id text not null references users(id) on delete cascade,
  kind      text not null check (kind in ('block','mute')),
  primary key (user_id, target_id, kind)
);

-- ── Aggregation table: maintained by triggers, never computed per request ─

create table song_stats (
  song_id      text primary key references songs(id) on delete cascade,
  rating_count int not null default 0,
  rating_sum   numeric not null default 0,
  histogram    int[] not null default '{0,0,0,0,0,0,0,0,0,0}',  -- ½ star … 5 stars
  log_count    int not null default 0,
  review_count int not null default 0,
  like_count   int not null default 0
);

-- Recomputes one song's row from the rows that matter. Exactly right by construction.
create or replace function refresh_song_stats(p_song text) returns void language sql as $$
  insert into song_stats (song_id, rating_count, rating_sum, histogram, log_count, review_count, like_count)
  select
    p_song,
    (select count(*) from ratings where song_id = p_song),
    (select coalesce(sum(rating), 0) from ratings where song_id = p_song),
    array(select (select count(*) from ratings r where r.song_id = p_song and (r.rating * 2)::int = g)::int from generate_series(1, 10) g),
    (select count(*) from diary_entries where song_id = p_song and not removed),
    (select count(*) from diary_entries where song_id = p_song and not removed and review_text is not null and review_text <> ''),
    (select count(*) from likes where song_id = p_song)
  on conflict (song_id) do update set
    rating_count = excluded.rating_count, rating_sum = excluded.rating_sum, histogram = excluded.histogram,
    log_count = excluded.log_count, review_count = excluded.review_count, like_count = excluded.like_count;
$$;

create or replace function trg_refresh_song_stats() returns trigger language plpgsql as $$
begin
  if tg_op <> 'DELETE' then perform refresh_song_stats(new.song_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.song_id <> new.song_id) then perform refresh_song_stats(old.song_id); end if;
  return null;
end $$;

create trigger ratings_stats after insert or update or delete on ratings for each row execute function trg_refresh_song_stats();
create trigger diary_stats   after insert or update or delete on diary_entries for each row execute function trg_refresh_song_stats();
create trigger likes_stats   after insert or update or delete on likes for each row execute function trg_refresh_song_stats();

-- New songs start with an empty stats row, like the app does.
create or replace function trg_song_stats_row() returns trigger language plpgsql as $$
begin
  insert into song_stats (song_id) values (new.id) on conflict do nothing;
  return null;
end $$;
create trigger songs_stats_row after insert on songs for each row execute function trg_song_stats_row();

-- Trending (refresh every few minutes from a scheduled job:
--   refresh materialized view concurrently trending_songs).
create materialized view trending_songs as
  select song_id, count(*) + 0.5 * count(review_text) as score
  from diary_entries
  where created_at > now() - interval '7 days' and not removed
  group by song_id;
create unique index trending_songs_pk on trending_songs(song_id);
