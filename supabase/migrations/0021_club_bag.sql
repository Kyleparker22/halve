-- What is in your bag, and how far you actually hit it.
--
-- Carry, not total. A club recommendation is about clearing what is in front of
-- you — water, a bunker, the front edge — and roll is the least predictable part
-- of a golf shot. Someone who enters their best-ever 7 iron will be told to hit
-- 7 iron from a distance they reach once a season, so the field is labelled
-- "stock carry" everywhere it is asked for.

create table player_clubs (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  -- Free text rather than an enum: people carry 4-hybrids, 58 degree wedges,
  -- driving irons and a 3-wood they call "the spoon".
  name        text not null check (length(trim(name)) between 1 and 24),
  carry_yards int not null check (carry_yards between 30 and 400),
  -- Longest first, so the bag reads the way it sits.
  position    int not null default 0,
  created_at  timestamptz default now(),
  unique (profile_id, name)
);
create index player_clubs_profile_idx on player_clubs (profile_id, carry_yards desc);

alter table player_clubs enable row level security;

-- Your bag is yours. Nobody else needs it, and a club distance is a mildly
-- embarrassing thing to have visible to the crew.
create policy "own clubs" on player_clubs for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

comment on table player_clubs is
  'Stock carry per club, self-entered. Carry rather than total because a '
  'recommendation is about clearing trouble, and roll is the least predictable '
  'part of a golf shot.';
