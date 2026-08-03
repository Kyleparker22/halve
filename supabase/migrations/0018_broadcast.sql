-- The broadcast booth: two announcers calling your round.
--
-- The design decision that makes this buildable rather than a research project:
-- nothing here tries to understand a video. The app already knows who is on
-- which hole, what they scored, what the money is and who is up — a missed
-- birdie putt is a row in `scores`, not a computer-vision problem. A clip only
-- has to be attached to a player and a hole; the commentary is written from the
-- structured truth we already have.
--
-- Storylines are the other half. "Rumour has it he was out late" cannot be
-- derived from a scorecard, so the crew supplies it before the round and the
-- announcers use it. That is where the comedy actually lives.

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------
create table round_media (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references rounds(id) on delete cascade,
  -- Who the clip is of. Null for a group shot or a landscape.
  subject_player_id uuid references round_players(id) on delete set null,
  hole_number       int check (hole_number between 1 and 18),
  uploaded_by       uuid not null references profiles(id) on delete cascade,
  storage_path      text not null,
  kind              text not null check (kind in ('photo', 'video')),
  caption           text check (caption is null or length(caption) <= 280),
  -- Set once a segment has been written about it, so the booth does not call
  -- the same putt twice.
  used_at           timestamptz,
  created_at        timestamptz default now()
);
create index round_media_round_idx on round_media (round_id, created_at);
create index round_media_unused_idx on round_media (round_id) where used_at is null;

-- ---------------------------------------------------------------------------
-- Storylines — the pre-round dirt
-- ---------------------------------------------------------------------------
create table round_storylines (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references rounds(id) on delete cascade,
  subject_player_id uuid not null references round_players(id) on delete cascade,
  submitted_by      uuid not null references profiles(id) on delete cascade,
  body              text not null check (length(trim(body)) between 1 and 280),
  created_at        timestamptz default now()
);
create index round_storylines_round_idx on round_storylines (round_id);

-- ---------------------------------------------------------------------------
-- Segments
-- ---------------------------------------------------------------------------
create table broadcast_segments (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references rounds(id) on delete cascade,
  media_id    uuid references round_media(id) on delete set null,
  hole_number int check (hole_number between 1 and 18),
  -- [{ "speaker": "Hal", "line": "..." }, ...] — two voices, a few lines.
  script      jsonb not null,
  audio_path  text,
  created_at  timestamptz default now()
);
create index broadcast_segments_round_idx on broadcast_segments (round_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Roast intensity, per crew.
--
-- A crew's in-jokes are funny to that crew. Without a dial, the booth
-- eventually says something about somebody's wife that stops being funny, and
-- the fix has to be a setting rather than a prompt tweak after the fact.
-- ---------------------------------------------------------------------------
alter table crews add column roast_level text not null default 'spicy'
  check (roast_level in ('gentle', 'spicy', 'brutal'));

comment on column crews.roast_level is
  'How hard the broadcast booth is allowed to go. Crew-controlled on purpose — '
  'the line sits in a different place for every group.';

-- ---------------------------------------------------------------------------
-- RLS. Everything is scoped to the round, which can_read_round already answers.
-- ---------------------------------------------------------------------------
alter table round_media        enable row level security;
alter table round_storylines   enable row level security;
alter table broadcast_segments enable row level security;

create policy "read round media" on round_media for select to authenticated
  using (public.can_read_round(round_id));
create policy "add round media" on round_media for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_read_round(round_id));
create policy "remove own media" on round_media for delete to authenticated
  using (uploaded_by = auth.uid());

create policy "read storylines" on round_storylines for select to authenticated
  using (public.can_read_round(round_id));
create policy "add storylines" on round_storylines for insert to authenticated
  with check (submitted_by = auth.uid() and public.can_read_round(round_id));
create policy "remove own storylines" on round_storylines for delete to authenticated
  using (submitted_by = auth.uid());

-- Segments are written by the edge function with the service role; players read.
create policy "read segments" on broadcast_segments for select to authenticated
  using (public.can_read_round(round_id));

-- ---------------------------------------------------------------------------
-- Storage. Private, keyed by round id, same shape as receipts.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent; skipping round-media bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('round-media', 'round-media', false, 104857600,
          array['image/jpeg', 'image/png', 'image/heic', 'image/webp',
                'video/mp4', 'video/quicktime'])
  on conflict (id) do nothing;

  execute $pol$
    create policy "round players read media" on storage.objects for select
      to authenticated
      using (bucket_id = 'round-media'
             and public.can_read_round(((storage.foldername(name))[1])::uuid))
  $pol$;

  execute $pol$
    create policy "round players upload media" on storage.objects for insert
      to authenticated
      with check (bucket_id = 'round-media'
                  and public.can_read_round(((storage.foldername(name))[1])::uuid))
  $pol$;
exception
  when duplicate_object then
    raise notice 'round-media storage policies already exist';
  when others then
    raise notice 'could not configure round-media bucket: %', sqlerrm;
end $$;

comment on table round_media is
  'Photos and clips from a round. Deliberately not analysed — the app already '
  'knows what happened from the scorecard; the clip only needs a player and a hole.';
