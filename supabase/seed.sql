-- Halve — development seed (docs/03 Data Model.md §13)
-- 3 courses with full tee/hole data including stroke indexes (one 9-hole),
-- 2 crews, 6 profiles, 2 crew guests, 1 completed round with full scores and a
-- settled Nassau, 1 upcoming round with an open seat marked friends_of_friends,
-- 1 trip in planning with rooms, members and expenses.
--
-- `supabase db reset` must leave every screen in the app populated.

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------

insert into courses (id, source, external_id, name, club_name, city, state, country, lat, lng, hole_count)
values
  ('b0000000-0000-4000-a000-000000000001', 'manual', 'seed-copperhead', 'Copperhead',
   'Innisbrook Resort', 'Palm Harbor', 'FL', 'US', 28.100000, -82.700000, 18),
  ('b0000000-0000-4000-a000-000000000002', 'manual', 'seed-sweetens', 'Sweetens Cove',
   'Sweetens Cove Golf Club', 'South Pittsburg', 'TN', 'US', 35.020000, -85.700000, 9),
  ('b0000000-0000-4000-a000-000000000003', 'manual', 'seed-bethpage', 'Bethpage Black',
   'Bethpage State Park', 'Farmingdale', 'NY', 'US', 40.740000, -73.460000, 18);

insert into tees (id, course_id, name, gender, par, yardage, rating, slope)
values
  ('c0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000001', 'Copperhead', 'M', 71, 6750, 73.1, 140),
  ('c0000000-0000-4000-a000-000000000002', 'b0000000-0000-4000-a000-000000000001', 'Osprey',     'M', 71, 6300, 70.6, 132),
  ('c0000000-0000-4000-a000-000000000003', 'b0000000-0000-4000-a000-000000000002', 'Cove',       'M', 36, 3300, 35.4, 128),
  ('c0000000-0000-4000-a000-000000000004', 'b0000000-0000-4000-a000-000000000003', 'Black',      'M', 71, 7350, 76.6, 148);

-- Copperhead / Copperhead tee. Odd stroke indexes on the front nine, even on the
-- back — the convention the 9-hole handicap rule depends on.
insert into holes (tee_id, number, par, yardage, stroke_index)
select 'c0000000-0000-4000-a000-000000000001', n, par, yards, si
from (values
  (1,4,430,7),(2,4,420,5),(3,3,190,17),(4,5,560,3),(5,4,450,9),
  (6,4,400,11),(7,4,405,13),(8,3,215,15),(9,5,570,1),
  (10,4,435,8),(11,3,175,18),(12,4,455,4),(13,4,425,6),(14,5,590,2),
  (15,4,410,10),(16,3,200,16),(17,4,440,12),(18,4,445,14)
) as h(n, par, yards, si);

-- Osprey tee: same routing, shorter.
insert into holes (tee_id, number, par, yardage, stroke_index)
select 'c0000000-0000-4000-a000-000000000002', number, par, (yardage * 0.93)::int, stroke_index
from holes where tee_id = 'c0000000-0000-4000-a000-000000000001';

-- Sweetens Cove: nine holes, indexes 1–9.
insert into holes (tee_id, number, par, yardage, stroke_index)
select 'c0000000-0000-4000-a000-000000000003', n, par, yards, si
from (values
  (1,4,395,5),(2,5,530,3),(3,3,165,9),(4,4,410,1),(5,4,340,7),
  (6,3,205,6),(7,5,560,2),(8,4,375,8),(9,4,320,4)
) as h(n, par, yards, si);

insert into holes (tee_id, number, par, yardage, stroke_index)
select 'c0000000-0000-4000-a000-000000000004', n, par, yards, si
from (values
  (1,4,430,9),(2,4,390,11),(3,3,230,7),(4,5,517,1),(5,4,478,3),
  (6,4,408,13),(7,5,553,5),(8,3,210,17),(9,4,460,15),
  (10,4,502,2),(11,4,435,10),(12,4,504,4),(13,5,608,6),(14,3,161,18),
  (15,4,478,8),(16,4,490,12),(17,3,207,16),(18,4,411,14)
) as h(n, par, yards, si);

-- ---------------------------------------------------------------------------
-- Identity. Inserting into auth.users fires handle_new_user(), which creates the
-- profile row — seeding the trigger path rather than around it.
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, '', now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('handle', handle, 'display_name', display_name)
from (values
  ('a0000000-0000-4000-a000-000000000001'::uuid, 'kyle@example.com',   'kyle',   'Kyle Parker'),
  ('a0000000-0000-4000-a000-000000000002'::uuid, 'todd@example.com',   'todd',   'Todd Nguyen'),
  ('a0000000-0000-4000-a000-000000000003'::uuid, 'marcus@example.com', 'marcus', 'Marcus Hill'),
  ('a0000000-0000-4000-a000-000000000004'::uuid, 'dana@example.com',   'dana',   'Dana Whitfield'),
  ('a0000000-0000-4000-a000-000000000005'::uuid, 'ryan@example.com',   'ryan',   'Ryan Okafor'),
  ('a0000000-0000-4000-a000-000000000006'::uuid, 'priya@example.com',  'priya',  'Priya Raman')
) as u(id, email, handle, display_name);

update profiles set handicap_index = v.idx, home_course_id = v.home
from (values
  ('a0000000-0000-4000-a000-000000000001'::uuid,  8.4, 'b0000000-0000-4000-a000-000000000001'::uuid),
  ('a0000000-0000-4000-a000-000000000002'::uuid, 11.2, 'b0000000-0000-4000-a000-000000000001'::uuid),
  ('a0000000-0000-4000-a000-000000000003'::uuid, 16.7, 'b0000000-0000-4000-a000-000000000003'::uuid),
  ('a0000000-0000-4000-a000-000000000004'::uuid,  4.1, 'b0000000-0000-4000-a000-000000000001'::uuid),
  ('a0000000-0000-4000-a000-000000000005'::uuid, 21.3, 'b0000000-0000-4000-a000-000000000002'::uuid),
  ('a0000000-0000-4000-a000-000000000006'::uuid, -1.2, 'b0000000-0000-4000-a000-000000000002'::uuid)
) as v(id, idx, home)
where profiles.id = v.id;

-- Explicit friendship (mirrored by trigger).
insert into friendships (profile_id, friend_id)
values ('a0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000005');

-- ---------------------------------------------------------------------------
-- Crews & guests
-- ---------------------------------------------------------------------------

insert into crews (id, name, invite_code, created_by) values
  ('d0000000-0000-4000-a000-000000000001', 'Saturday Regulars', 'sat4some01', 'a0000000-0000-4000-a000-000000000001'),
  ('d0000000-0000-4000-a000-000000000002', 'College Buddies',   'clg9iron22', 'a0000000-0000-4000-a000-000000000005');

insert into crew_members (crew_id, profile_id, role) values
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001', 'owner'),
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000002', 'admin'),
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000003', 'member'),
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000004', 'member'),
  ('d0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000005', 'owner'),
  ('d0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', 'member'),
  ('d0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000006', 'member');

insert into crew_guests (id, crew_id, name, vouched_by) values
  ('e0000000-0000-4000-a000-000000000001', 'd0000000-0000-4000-a000-000000000001', 'Big Dave',
   'a0000000-0000-4000-a000-000000000001'),
  ('e0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001', 'Sean from work',
   'a0000000-0000-4000-a000-000000000002');

-- ---------------------------------------------------------------------------
-- Completed round: last Saturday at Copperhead, four players including a guest.
-- ---------------------------------------------------------------------------

insert into rounds (id, crew_id, course_id, tee_id, name, scheduled_at, timezone,
                    hole_count, status, visibility, max_players, created_by, completed_at)
values ('10000000-0000-4000-a000-000000000001', 'd0000000-0000-4000-a000-000000000001',
        'b0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001',
        'Saturday game', now() - interval '7 days', 'America/New_York',
        18, 'completed', 'crew', 4, 'a0000000-0000-4000-a000-000000000001',
        now() - interval '7 days' + interval '5 hours');

insert into round_players (id, round_id, profile_id, guest_id, rsvp, playing_handicap, tee_id, position) values
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000001', null, 'in', 10, 'c0000000-0000-4000-a000-000000000001', 1),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000002', null, 'in', 13, 'c0000000-0000-4000-a000-000000000001', 2),
  ('20000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000003', null, 'in', 19, 'c0000000-0000-4000-a000-000000000001', 3),
  ('20000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000001',
   null, 'e0000000-0000-4000-a000-000000000001', 'in', 24, 'c0000000-0000-4000-a000-000000000001', 4);

insert into scores (round_player_id, hole_number, strokes, client_id, client_updated_at, updated_by)
select p.rp, t.ord::int, t.strokes, gen_random_uuid(),
       now() - interval '7 days' + (t.ord * interval '12 minutes'), p.by
from (values
  -- Kyle: 38 out, 38 in = 76
  ('20000000-0000-4000-a000-000000000001'::uuid, 'a0000000-0000-4000-a000-000000000001'::uuid,
   array[4,5,3,5,4,4,5,3,5, 5,3,4,5,5,4,4,4,4]),
  -- Todd: 40 out, 37 in = 77
  ('20000000-0000-4000-a000-000000000002'::uuid, 'a0000000-0000-4000-a000-000000000001'::uuid,
   array[5,4,4,6,4,4,4,4,5, 4,3,5,4,5,4,3,5,4]),
  -- Marcus: 41 out, 40 in = 81
  ('20000000-0000-4000-a000-000000000003'::uuid, 'a0000000-0000-4000-a000-000000000001'::uuid,
   array[5,4,4,5,4,5,4,4,6, 4,4,4,5,6,4,3,5,5]),
  -- Big Dave (guest): 45 out, 44 in = 89
  ('20000000-0000-4000-a000-000000000004'::uuid, 'a0000000-0000-4000-a000-000000000001'::uuid,
   array[6,5,4,6,5,5,4,4,6, 5,4,5,5,6,5,4,5,5])
) as p(rp, by, arr),
unnest(p.arr) with ordinality as t(strokes, ord);

-- The settled Nassau: Kyle v Todd, gross, $20 a side, no presses. Match play,
-- three bets, and these amounts are what @halve/games computes off this card
-- (see packages/games/src/games/nassau.test.ts — same scorecard).
--   Front  Kyle wins 2&1   → Kyle +$20
--   Back   Todd wins 1 up  → Todd +$20
--   Total  Kyle wins 1 up  → Kyle +$20
--   Net    Kyle +$20, Todd −$20
insert into games (id, round_id, type, name, config, created_by, computed_at) values
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'nassau',
   'Nassau — Kyle v Todd',
   '{"type":"nassau","stakeCents":2000,"handicap":{"mode":"gross"},
     "presses":{"mode":"none"},"lowManAdjustment":true}'::jsonb,
   'a0000000-0000-4000-a000-000000000001', now() - interval '7 days' + interval '5 hours');

insert into game_participants (game_id, round_player_id, team_id) values
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', null),
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002', null);

insert into game_results (game_id, round_player_id, amount_cents, breakdown) values
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', 2000,
   '{"summary":"Kyle won $20.",
     "lines":[{"segment":"Front","holes":[1,8],"text":"Front — Kyle won 2&1. $20 a side."},
              {"segment":"Back","holes":[10,18],"text":"Back — Todd won 1 up. $20 a side."},
              {"segment":"Total","holes":[1,18],"text":"Total — Kyle won 1 up. $20 a side."}]}'::jsonb),
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002', -2000,
   '{"summary":"Todd lost $20.",
     "lines":[{"segment":"Front","holes":[1,8],"text":"Front — Kyle won 2&1. $20 a side."},
              {"segment":"Back","holes":[10,18],"text":"Back — Todd won 1 up. $20 a side."},
              {"segment":"Total","holes":[1,18],"text":"Total — Kyle won 1 up. $20 a side."}]}'::jsonb);

-- ---------------------------------------------------------------------------
-- Ledger: the Nassau entry, settled through a confirmed batch. Plus two open
-- entries so the ledger screen has something live in it.
-- ---------------------------------------------------------------------------

insert into settlement_batches (id, crew_id, created_by, status, created_at, closed_at) values
  ('80000000-0000-4000-a000-000000000001', 'd0000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000001', 'confirmed',
   now() - interval '6 days', now() - interval '6 days' + interval '2 hours');

insert into settlements (id, batch_id, from_profile, to_profile, amount_cents, method,
                         status, confirmed_by, created_at, confirmed_at) values
  ('80000000-0000-4000-a000-000000000002', '80000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', 2000,
   'venmo', 'confirmed', 'a0000000-0000-4000-a000-000000000001',
   now() - interval '6 days', now() - interval '6 days' + interval '2 hours');

insert into ledger_entries (id, crew_id, from_profile, to_profile, amount_cents,
                            source_type, source_id, note, status, batch_id, created_at) values
  ('70000000-0000-4000-a000-000000000001', 'd0000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', 2000,
   'game', '30000000-0000-4000-a000-000000000001', 'Nassau at Copperhead', 'settled',
   '80000000-0000-4000-a000-000000000001', now() - interval '7 days'),
  -- open entries
  ('70000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000001', 1800,
   'manual', null, 'Lunch at the turn, split four ways', 'open', null, now() - interval '7 days'),
  ('70000000-0000-4000-a000-000000000003', 'd0000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000002', 2500,
   'manual', null, 'Skins, week before', 'open', null, now() - interval '14 days');

-- ---------------------------------------------------------------------------
-- Upcoming round with an open seat, visible two hops out.
-- ---------------------------------------------------------------------------

insert into rounds (id, crew_id, course_id, tee_id, name, scheduled_at, timezone,
                    hole_count, status, visibility, max_players, created_by, booking_url)
values ('10000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001',
        'b0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001',
        'Saturday 8:40', now() + interval '4 days', 'America/New_York',
        18, 'scheduled', 'friends_of_friends', 4, 'a0000000-0000-4000-a000-000000000001',
        'https://www.golfnow.com/tee-times/facility/seed-copperhead');

insert into round_players (id, round_id, profile_id, rsvp, tee_id, position) values
  ('20000000-0000-4000-a000-000000000011', '10000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000001', 'in', 'c0000000-0000-4000-a000-000000000001', 1),
  ('20000000-0000-4000-a000-000000000012', '10000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000002', 'in', 'c0000000-0000-4000-a000-000000000001', 2),
  ('20000000-0000-4000-a000-000000000013', '10000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000003', 'invited', 'c0000000-0000-4000-a000-000000000001', 3);

-- ---------------------------------------------------------------------------
-- Trip in planning: rooms, members, expenses. Room assignment fires
-- sync_room_expense(), which generates the lodging expense and its even split.
-- ---------------------------------------------------------------------------

insert into trips (id, crew_id, name, destination, start_date, end_date, status,
                   invite_code, created_by)
values ('40000000-0000-4000-a000-000000000001', 'd0000000-0000-4000-a000-000000000001',
        'Sand Valley', 'Nekoosa, WI',
        (current_date + 60)::date, (current_date + 63)::date, 'planning',
        'sandvly777', 'a0000000-0000-4000-a000-000000000001');

insert into rooms (id, trip_id, name, capacity, cost_cents, paid_by) values
  ('50000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001',
   'Lodge 2A', 2, 96000, 'a0000000-0000-4000-a000-000000000001'),
  ('50000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000001',
   'Lodge 2B', 3, 120000, 'a0000000-0000-4000-a000-000000000002');

insert into trip_members (id, trip_id, profile_id, guest_id, status, room_id) values
  ('60000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000001', null, 'in', '50000000-0000-4000-a000-000000000001'),
  ('60000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000002', null, 'in', '50000000-0000-4000-a000-000000000001'),
  ('60000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000003', null, 'in', '50000000-0000-4000-a000-000000000002'),
  ('60000000-0000-4000-a000-000000000004', '40000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-a000-000000000004', null, 'maybe', '50000000-0000-4000-a000-000000000002'),
  -- a guest on the trip: money resolves to their voucher
  ('60000000-0000-4000-a000-000000000005', '40000000-0000-4000-a000-000000000001',
   null, 'e0000000-0000-4000-a000-000000000001', 'in', '50000000-0000-4000-a000-000000000002');

-- A hand-logged expense, split evenly across everyone who is in.
with e as (
  insert into trip_expenses (id, trip_id, description, amount_cents, paid_by)
  values ('90000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001',
          'Sunday greens fees', 84000, '60000000-0000-4000-a000-000000000001')
  returning id
)
select public.split_expense_evenly(
  '90000000-0000-4000-a000-000000000001',
  array['60000000-0000-4000-a000-000000000001'::uuid,
        '60000000-0000-4000-a000-000000000002'::uuid,
        '60000000-0000-4000-a000-000000000003'::uuid,
        '60000000-0000-4000-a000-000000000005'::uuid])
from e;

-- Trip rounds: two of the four days scheduled.
insert into rounds (id, crew_id, trip_id, course_id, tee_id, name, scheduled_at, timezone,
                    hole_count, status, max_players, created_by)
values
  ('10000000-0000-4000-a000-000000000003', 'd0000000-0000-4000-a000-000000000001',
   '40000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000003',
   'c0000000-0000-4000-a000-000000000004', 'Day 1 — morning', (current_date + 60)::timestamptz + interval '8 hours',
   'America/Chicago', 18, 'scheduled', 8, 'a0000000-0000-4000-a000-000000000001'),
  ('10000000-0000-4000-a000-000000000004', 'd0000000-0000-4000-a000-000000000001',
   '40000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000002',
   'c0000000-0000-4000-a000-000000000003', 'Day 2 — the nine', (current_date + 61)::timestamptz + interval '15 hours',
   'America/Chicago', 9, 'scheduled', 8, 'a0000000-0000-4000-a000-000000000001');

-- ---------------------------------------------------------------------------
-- Feed & chat
-- ---------------------------------------------------------------------------

insert into feed_items (crew_id, actor_id, type, subject_type, subject_id, payload, created_at) values
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001',
   'round_completed', 'round', '10000000-0000-4000-a000-000000000001',
   '{"course":"Copperhead","low":{"name":"Kyle Parker","gross":76},
     "money":[{"name":"Kyle Parker","cents":2000},{"name":"Todd Nguyen","cents":-2000}]}'::jsonb,
   now() - interval '7 days'),
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001',
   'trip_created', 'trip', '40000000-0000-4000-a000-000000000001',
   '{"name":"Sand Valley","destination":"Nekoosa, WI"}'::jsonb, now() - interval '2 days');

insert into messages (crew_id, author_id, body, created_at) values
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000002',
   'Still owe Kyle twenty from the Nassau. Paid.', now() - interval '6 days'),
  ('d0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001',
   'Saturday 8:40 is up. One seat open if anyone knows a body.', now() - interval '1 day');

insert into messages (round_id, author_id, body, created_at) values
  ('10000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000003',
   'Might be 10 minutes late, start without me.', now() - interval '3 hours');
