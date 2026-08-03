/**
 * Course naming, which providers handle badly.
 *
 * A multi-course club comes back as bare "East", "West", "North", "South" with
 * the identifying part in club_name — so "East" on a round card tells a golfer
 * nothing, and searching "Winged Foot" finds nothing unless the club is
 * searched too. Both problems are naming, not coverage.
 */

export interface CourseNameParts {
  name: string;
  club_name?: string | null;
}

/** "Winged Foot Golf Club — East", or just the name when the club adds nothing. */
export function courseLabel(course: CourseNameParts | null | undefined): string {
  if (!course) return '';
  const name = (course.name ?? '').trim();
  const club = (course.club_name ?? '').trim();
  if (!club || club.toLowerCase() === name.toLowerCase()) return name;
  // Some providers already fold the club into the course name.
  if (name.toLowerCase().includes(club.toLowerCase())) return name;
  return `${club} — ${name}`;
}

/** The short form for tight spots: the course, falling back to the club. */
export function courseShortLabel(course: CourseNameParts | null | undefined): string {
  if (!course) return '';
  const name = (course.name ?? '').trim();
  const club = (course.club_name ?? '').trim();
  return name || club;
}

/** PostgREST filter matching either the course or its club. */
export const courseSearchFilter = (term: string) =>
  `name.ilike.%${term}%,club_name.ilike.%${term}%`;
