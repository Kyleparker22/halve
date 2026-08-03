-- The cache gate was wrong. It only skipped the provider when a search already
-- had five or more local matches, so any specific search — which is what people
-- actually type, "Pebble Beach", their home course — went to the provider on
-- every keystroke-completed query, forever. The free tier is small and the data
-- model is explicit that the provider must never be on a hot path.
--
-- Remembering which terms have been asked is what makes the cache work: a term
-- searched recently is served locally, including when the answer was nothing.
-- Negative results matter most — a course the provider does not have would
-- otherwise be re-queried for eternity.

create table course_search_log (
  term        text primary key,
  hits        int not null default 0,
  searched_at timestamptz not null default now()
);

alter table course_search_log enable row level security;
-- No policies: only the search function touches this, with the service role.

comment on table course_search_log is
  'Terms already sent to the course provider, so they are not sent twice. '
  'Written only by the course-search edge function.';
