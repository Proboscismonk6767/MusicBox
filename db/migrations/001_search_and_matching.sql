-- Search and history-import matching.
--
-- `search_text` holds the normalised text a row is searched by (see src/lib/search-norm.ts),
-- so a search can narrow candidates with an index instead of reading every row.
-- `match_key` on songs is the normalised title used to match a Spotify-history track to a
-- song MusicBox already has (see normalizeTitle in src/lib/spotify-import.ts).
-- Both are written by the application whenever it inserts a row.

alter table songs   add column search_text text not null default '';
alter table songs   add column match_key   text not null default '';
alter table artists add column search_text text not null default '';
alter table albums  add column search_text text not null default '';
alter table users   add column search_text text not null default '';
alter table lists   add column search_text text not null default '';

create index songs_search_trgm   on songs   using gin (search_text gin_trgm_ops);
create index artists_search_trgm on artists using gin (search_text gin_trgm_ops);
create index albums_search_trgm  on albums  using gin (search_text gin_trgm_ops);
create index users_search_trgm   on users   using gin (search_text gin_trgm_ops);
create index lists_search_trgm   on lists   using gin (search_text gin_trgm_ops);
create index songs_match_key     on songs(match_key);
