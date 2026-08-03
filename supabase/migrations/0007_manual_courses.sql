-- Courses are written by the service role only — the catalogue is shared, so a
-- client cannot be trusted with a direct insert. But a crew still has to be
-- able to add the muni that no provider has, and to correct a scorecard whose
-- stroke indexes came back missing. Both go through security-definer functions
-- with the validation the table cannot express.

/**
 * Add a course by hand. Returns the tee id, because the caller's next move is
 * always to fill in the card.
 *
 * p_holes is [{ "number": 1, "par": 4, "stroke_index": 7, "yardage": 430 }, ...]
 */
create or replace function public.create_manual_course(
  p_name       text,
  p_city       text,
  p_state      text,
  p_tee_name   text,
  p_par        int,
  p_rating     numeric,
  p_slope      int,
  p_holes      jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_course_id uuid;
  v_tee_id    uuid;
  v_count     int;
  v_distinct  int;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to add a course';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a course needs a name';
  end if;

  select count(*), count(distinct (h->>'number')::int)
    into v_count, v_distinct
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
          'M', p_par, p_rating, p_slope)
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

/**
 * Correct a scorecard. This is the needs_review path: a provider that omits
 * stroke indexes leaves net games unplayable, and only a human with the card
 * in front of them can fix it.
 */
create or replace function public.update_hole_card(p_tee_id uuid, p_holes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_course_id uuid;
  v_indexes   int[];
begin
  if auth.uid() is null then
    raise exception 'must be signed in to correct a card';
  end if;

  select course_id into v_course_id from tees where id = p_tee_id;
  if v_course_id is null then
    raise exception 'tee not found';
  end if;

  -- Stroke indexes must be a permutation, or allocation silently misallocates
  -- strokes and the money comes out wrong.
  select array_agg((h->>'stroke_index')::int order by (h->>'stroke_index')::int)
    into v_indexes from jsonb_array_elements(p_holes) h;

  if v_indexes <> (select array_agg(i order by i) from generate_series(1, array_length(v_indexes, 1)) i)
  then
    raise exception 'stroke indexes must be 1..% with no repeats', array_length(v_indexes, 1);
  end if;

  update holes h
     set par = (x->>'par')::int,
         stroke_index = (x->>'stroke_index')::int,
         yardage = coalesce(nullif(x->>'yardage', '')::int, h.yardage)
    from jsonb_array_elements(p_holes) x
   where h.tee_id = p_tee_id and h.number = (x->>'number')::int;

  update tees set par = (select sum(par) from holes where tee_id = p_tee_id) where id = p_tee_id;
  update courses set needs_review = false, updated_at = now() where id = v_course_id;
end $$;
