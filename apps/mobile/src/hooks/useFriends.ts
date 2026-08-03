import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Friend {
  profileId: string;
  name: string;
  handle: string;
  handicap: number | null;
  /** City/state of their home course — the only location the app knows. */
  location: string | null;
  /** Which crews you share, for the "how do I know them" line. */
  sharedCrews: string[];
}

/**
 * Your people.
 *
 * "Friends" here is everyone you share a crew with, plus any explicit
 * friendship rows. The distinction matters because nothing in the app creates
 * friendship rows yet — a list built only on that table would be empty for
 * every user forever. Crew-mates are the truthful answer to "who are my golf
 * friends" today, and the explicit table folds in when a path exists to fill
 * it.
 *
 * Location is the home course's city — the app deliberately never stores a
 * person's own location, and the home course is what matters for golf anyway.
 */
export function useFriends(profileId: string | undefined) {
  return useQuery({
    queryKey: ['friends', profileId ?? 'none'],
    enabled: Boolean(profileId),
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<Friend[]> => {
      // My crews, then everyone in them. RLS already scopes crew_members to
      // crews I belong to, so the second query cannot over-fetch.
      const { data: myCrews, error: crewsError } = await supabase
        .from('crew_members')
        .select('crew_id, crews(name)')
        .eq('profile_id', profileId!);
      if (crewsError) throw crewsError;

      const crewIds = (myCrews ?? []).map((c) => c.crew_id);
      const crewName = new Map(
        ((myCrews ?? []) as unknown as Array<{ crew_id: string; crews: { name: string } | null }>).map(
          (c) => [c.crew_id, c.crews?.name ?? 'a crew'],
        ),
      );

      const [{ data: mates, error: matesError }, { data: explicit }] = await Promise.all([
        crewIds.length > 0
          ? supabase
              .from('crew_members')
              .select(
                'crew_id, profile_id, profiles(id, display_name, handle, handicap_index, courses(city, state))',
              )
              .in('crew_id', crewIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('friendships').select('friend_id').eq('profile_id', profileId!),
      ]);
      if (matesError) throw matesError;

      const byId = new Map<string, Friend>();
      for (const row of (mates ?? []) as unknown as Array<{
        crew_id: string;
        profile_id: string;
        profiles: {
          id: string;
          display_name: string;
          handle: string;
          handicap_index: number | null;
          courses: { city: string | null; state: string | null } | null;
        } | null;
      }>) {
        if (!row.profiles || row.profile_id === profileId) continue;
        const existing = byId.get(row.profile_id);
        if (existing) {
          existing.sharedCrews.push(crewName.get(row.crew_id) ?? 'a crew');
          continue;
        }
        const home = row.profiles.courses;
        byId.set(row.profile_id, {
          profileId: row.profile_id,
          name: row.profiles.display_name,
          handle: row.profiles.handle,
          handicap: row.profiles.handicap_index,
          location: home ? [home.city, home.state].filter(Boolean).join(', ') || null : null,
          sharedCrews: [crewName.get(row.crew_id) ?? 'a crew'],
        });
      }

      // Explicit friendships outside any shared crew: fetch the profiles we
      // have not already seen. Usually none today; correct when it happens.
      const missing = ((explicit ?? []) as Array<{ friend_id: string }>)
        .map((f) => f.friend_id)
        .filter((id) => id !== profileId && !byId.has(id));
      if (missing.length > 0) {
        const { data: extra } = await supabase
          .from('profiles')
          .select('id, display_name, handle, handicap_index, courses(city, state)')
          .in('id', missing);
        for (const p of (extra ?? []) as unknown as Array<{
          id: string;
          display_name: string;
          handle: string;
          handicap_index: number | null;
          courses: { city: string | null; state: string | null } | null;
        }>) {
          byId.set(p.id, {
            profileId: p.id,
            name: p.display_name,
            handle: p.handle,
            handicap: p.handicap_index,
            location: p.courses
              ? [p.courses.city, p.courses.state].filter(Boolean).join(', ') || null
              : null,
            sharedCrews: [],
          });
        }
      }

      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
