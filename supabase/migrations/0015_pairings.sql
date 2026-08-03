-- Pairings, persisted.
--
-- generatePairings() ran on every render of the trip screen and its output went
-- nowhere. That made it a suggestion, not a plan: it could not be overridden,
-- it silently changed whenever the roster changed, and the groups it proposed
-- never reached the scorecard where people actually needed them. A trip
-- organiser who moves Dana into the second group needs that to stick.
--
-- A pairing is which foursome a player is in for one round, so it belongs on
-- round_players rather than in a table of its own. That also means the groups
-- follow through to scoring for free.

alter table round_players add column group_number int check (group_number > 0);

create index round_players_group_idx on round_players (round_id, group_number);

comment on column round_players.group_number is
  'Which foursome this player is in for this round. Null means ungrouped — a '
  'single-group round does not need to say so. Set by the trip pairings '
  'generator and by hand; the generator never overwrites a round that has '
  'already been played.';
