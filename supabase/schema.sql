-- Bootstrap proposal. Inspect the existing Find It schema before applying.
-- No changes have been applied to the hosted project by preparing this file.
begin;
create table public.findit_games (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  version bigint not null default 1 check (version > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  creator_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index findit_games_expiry_idx on public.findit_games (expires_at);
create index findit_games_creator_idx on public.findit_games (creator_hash, created_at);
alter table public.findit_games enable row level security;
revoke all on public.findit_games from public, anon, authenticated;
grant select, insert, update, delete on public.findit_games to service_role;
-- No direct browser policy: the server authenticates each per-game capability.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('findit-photos','findit-photos',false,409600,array['image/jpeg']);
commit;
