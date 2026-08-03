-- Tidies create_manual_course:
--   * rating and slope are genuinely optional — a muni card often has neither,
--     and a required argument forces the caller to invent a number
--   * par is derived from the holes rather than passed, so there is one source
--     of truth for it, the same reason stake lives only inside games.config
-- Defaults must be trailing, so p_holes moves up.

drop function if exists public.create_manual_course(text, text, text, text, int, numeric, int, jsonb);

create or replace function public.create_manual_course(
  p_name     text,
  p_holes    jsonb,
  p_tee_name text default 'Default',
  p_city     text default null,
  p_state    text default null,
  p_rating   numeric default null,
  p_slope    int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_course_id uuid;
  v_tee_id    uuid;
  v_count     int;
  v_distinct  int;
  v_par       int;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to add a course';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a course needs a name';
  end if;

  select count(*), count(distinct (h->>'number')::int), sum((h->>'par')::int)
    into v_count, v_distinct, v_par
    from jsonb_array_elements(p_holes) h;

  if v_count not in (9, 18) then
    raise exception 'a course needs 9 or 18 holes, got %', v_count;
  end if;
  if v_distinct <> v_count then
    raise exception 'hole numbers must be unique';
  end if;

  insert into courses (source, external_id, name, city, state, country, hole_count, needs_review)
  values ('manual', null, btrim(p_name), nullif(btrim(coalesce(p_city, '')), ''),
          nullif(btrim(coalesce(p_state, '')), ''), 'US', v_count, false)
  returning id into v_course_id;

  insert into tees (course_id, name, gender, par, rating, slope)
  values (v_course_id, coalesce(nullif(btrim(coalesce(p_tee_name, '')), ''), 'Default'),
          'M', v_par, p_rating, p_slope)
  returning id into v_tee_id;

  insert into holes (tee_id, number, par, yardage, stroke_index)
  select v_tee_id,
         (h->>'number')::int,
         (h->>'par')::int,
         nullif(h->>'yardage', '')::int,
         (h->>'stroke_index')::int
    from jsonb_array_elements(p_holes) h;

  return v_tee_id;
end $$;
