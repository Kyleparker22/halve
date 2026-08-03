-- GPS: where the greens actually are.
--
-- The scorecard data we cache says a hole is 412 yards from the blue tee. That
-- is a fact about the hole, not about where you are standing — a golfer 150
-- yards out needs the distance from *here* to the green, which needs the
-- green's coordinates.
--
-- Source is OpenStreetMap for now. Golf courses are mapped there with
-- `golf=hole` ways and `golf=green` polygons, coverage is global and free, and
-- swapping to a licensed dataset later is replacing one importer. The tradeoff
-- is honest: a mapped course has excellent data and an unmapped one has none,
-- so `source` is recorded per row and a manual fallback is required rather than
-- optional.

create table hole_points (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  hole_number  int not null check (hole_number between 1 and 18),

  -- Front, centre and back of the green, which is what a yardage readout wants.
  green_front_lat numeric(9,6),
  green_front_lng numeric(9,6),
  green_lat       numeric(9,6) not null,
  green_lng       numeric(9,6) not null,
  green_back_lat  numeric(9,6),
  green_back_lng  numeric(9,6),

  -- Where the hole starts, used to derive the approach bearing.
  tee_lat      numeric(9,6),
  tee_lng      numeric(9,6),

  source       text not null check (source in ('osm', 'manual', 'provider')),
  -- OSM ids so a re-import can tell "unchanged" from "remapped".
  external_ref text,
  updated_at   timestamptz default now(),

  unique (course_id, hole_number)
);
create index hole_points_course_idx on hole_points (course_id);

alter table courses add column gps_source text
  check (gps_source is null or gps_source in ('osm', 'manual', 'provider'));
alter table courses add column gps_checked_at timestamptz;

comment on column courses.gps_checked_at is
  'When we last asked the provider about this course. Set even when nothing was '
  'found, so an unmapped course is not re-queried on every round.';

-- ---------------------------------------------------------------------------
-- RLS. Course data is reference data — any signed-in golfer may read it, the
-- same as courses and holes. Writes are the importer (service role) and the
-- manual drop-a-pin flow.
-- ---------------------------------------------------------------------------
alter table hole_points enable row level security;

create policy "read hole points" on hole_points for select to authenticated using (true);

/**
 * Manual correction: stand on the green and tap. This is not a nicety — OSM
 * coverage is uneven and a crew's home course may simply not be mapped, so
 * there has to be a path that does not depend on anyone else having done the
 * work.
 */
create or replace function public.set_green_point(
  p_course_id uuid, p_hole int, p_lat numeric, p_lng numeric
) returns hole_points language plpgsql security definer set search_path = public as $$
declare v_row hole_points;
begin
  if auth.uid() is null then
    raise exception 'must be signed in' using errcode = '42501';
  end if;
  if p_hole < 1 or p_hole > 18 then
    raise exception 'hole must be between 1 and 18';
  end if;

  insert into hole_points (course_id, hole_number, green_lat, green_lng, source)
  values (p_course_id, p_hole, p_lat, p_lng, 'manual')
  on conflict (course_id, hole_number) do update
    set green_lat = excluded.green_lat,
        green_lng = excluded.green_lng,
        -- A person standing on the green beats a polygon centroid, so the
        -- front/back estimates derived from OSM are dropped rather than kept
        -- alongside a centre they no longer relate to.
        green_front_lat = null, green_front_lng = null,
        green_back_lat = null,  green_back_lng = null,
        source = 'manual',
        updated_at = now()
  returning * into v_row;

  update courses set gps_source = 'manual', gps_checked_at = now()
   where id = p_course_id and (gps_source is null or gps_source = 'osm');

  return v_row;
end $$;

comment on table hole_points is
  'Green and tee coordinates per hole. OSM-sourced rows carry front/centre/back; '
  'manually dropped pins carry centre only. Data © OpenStreetMap contributors '
  'where source = ''osm'' — attribution is required wherever it is displayed.';
