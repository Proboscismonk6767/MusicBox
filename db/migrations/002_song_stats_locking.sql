-- song_stats must stay exact when several people rate, like or log the same song at once.
--
-- The original refresh_song_stats() counted a song's ratings, entries and likes and then wrote the
-- totals. Two transactions touching the same song each counted without seeing the other's
-- uncommitted row, and whichever wrote last overwrote the other, so the counters drifted.
--
-- Now the song's stats row is locked first. A second writer waits for the first to commit, and its
-- count (taken after the lock, in a fresh statement) includes the first writer's change.

create or replace function refresh_song_stats(p_song text) returns void language plpgsql as $$
begin
  insert into song_stats (song_id) values (p_song) on conflict do nothing;
  perform 1 from song_stats where song_id = p_song for update;
  update song_stats set
    rating_count = (select count(*) from ratings where song_id = p_song),
    rating_sum   = (select coalesce(sum(rating), 0) from ratings where song_id = p_song),
    histogram    = array(select (select count(*) from ratings r where r.song_id = p_song and (r.rating * 2)::int = g)::int from generate_series(1, 10) g),
    log_count    = (select count(*) from diary_entries where song_id = p_song and not removed),
    review_count = (select count(*) from diary_entries where song_id = p_song and not removed and review_text is not null and review_text <> ''),
    like_count   = (select count(*) from likes where song_id = p_song)
  where song_id = p_song;
end $$;
