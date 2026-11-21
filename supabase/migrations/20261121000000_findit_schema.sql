create table if not exists public.findit_challenges (
  challenge_id text primary key,
  name text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.findit_games (
  game_code text primary key check (game_code ~ '^[A-Z2-9]{4}$'),
  host_player_id text not null,
  status text not null check (status in ('WAITING','PLAYING','VOTING','FINISHED')),
  challenge_count integer not null check (challenge_count between 1 and 10),
  ended_early boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  voting_started_at timestamptz,
  finished_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  version bigint not null default 0
);
create table if not exists public.findit_players (
  player_id text primary key,
  game_code text not null references public.findit_games(game_code) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(game_code,name)
);
create table if not exists public.findit_game_challenges (
  game_code text not null references public.findit_games(game_code) on delete cascade,
  challenge_id text not null,
  challenge_number integer not null,
  name text not null,
  description text not null default '',
  primary key (game_code,challenge_id),
  unique (game_code,challenge_number)
);
create table if not exists public.findit_entries (
  entry_id text primary key,
  game_code text not null references public.findit_games(game_code) on delete cascade,
  player_id text not null references public.findit_players(player_id) on delete cascade,
  challenge_id text not null,
  challenge_number integer not null,
  status text not null check (status in ('SUBMITTED','PASSED')),
  photo_reference text,
  submitted_at timestamptz not null default now(),
  unique(game_code,player_id,challenge_id),
  check ((status='SUBMITTED' and photo_reference is not null) or (status='PASSED' and photo_reference is null))
);
create table if not exists public.findit_votes (
  vote_id text primary key,
  game_code text not null references public.findit_games(game_code) on delete cascade,
  challenge_id text not null,
  voter_player_id text not null references public.findit_players(player_id) on delete cascade,
  entry_id text not null references public.findit_entries(entry_id) on delete cascade,
  photo_owner_player_id text not null references public.findit_players(player_id) on delete cascade,
  is_self_vote boolean not null default false,
  voted_at timestamptz not null default now(),
  unique(game_code,voter_player_id,challenge_id)
);
create table if not exists public.findit_winners (
  id bigint generated always as identity primary key,
  game_code text not null,
  played_at timestamptz not null default now(),
  record_type text not null check (record_type in ('CHALLENGE','OVERALL','NO_WINNER')),
  challenge_number integer,
  challenge_name text,
  winner_player_id text,
  winner_name text not null,
  challenge_wins integer,
  winning_photo_reference text,
  is_joint_winner boolean not null default false,
  is_overall_winner boolean not null default false
);
create index if not exists findit_players_game_idx on public.findit_players(game_code);
create index if not exists findit_entries_game_challenge_idx on public.findit_entries(game_code,challenge_id);
create index if not exists findit_votes_game_idx on public.findit_votes(game_code,voter_player_id);
alter table public.findit_challenges enable row level security;
alter table public.findit_games enable row level security;
alter table public.findit_players enable row level security;
alter table public.findit_game_challenges enable row level security;
alter table public.findit_entries enable row level security;
alter table public.findit_votes enable row level security;
alter table public.findit_winners enable row level security;
revoke all on public.findit_challenges,public.findit_games,public.findit_players,public.findit_game_challenges,public.findit_entries,public.findit_votes,public.findit_winners from anon,authenticated;
create or replace function public.findit_save_snapshot(p_game_code text,p_expected_version bigint,p_snapshot jsonb)
returns bigint language plpgsql security definer set search_path=public
as $$
declare new_version bigint;
begin
  update public.findit_games set snapshot=p_snapshot,version=version+1
  where game_code=p_game_code and version=p_expected_version
  returning version into new_version;
  return new_version;
end;
$$;
revoke all on function public.findit_save_snapshot(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.findit_save_snapshot(text,bigint,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('findit-game-photos','findit-game-photos',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
insert into public.findit_challenges(challenge_id,name,description) values
('C001','Something Red','Find and photograph something mainly red.'),
('C002','Something Tiny','Find something surprisingly small.'),
('C003','A Reflection','Capture an interesting reflection.'),
('C004','Something Old','Find something that looks old or historic.'),
('C005','A Funny Sign','Find a sign, notice or label that makes you smile.'),
('C006','Something Round','Find something clearly circular or spherical.'),
('C007','Nature Close-Up','Take a close-up photo of something natural.'),
('C008','Something Blue','Find and photograph something mainly blue.'),
('C009','An Unusual Angle','Make an everyday object look different with your camera angle.'),
('C010','Something With Numbers','Find numbers somewhere in the world around you.'),
('C011','A Pattern','Capture an interesting repeated pattern.'),
('C012','Something Shiny','Find something that reflects or catches the light.')
on conflict(challenge_id) do nothing;
