import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { courseLabel } from '../lib/course';

export interface CourseRegular {
  key: string;
  name: string;
  roundsPlayed: number;
  bestGross: number;
  bestRoundId: string;
  scoringAverage: number;
}

export interface HoleRecord {
  number: number;
  par: number | null;
  averageStrokes: number;
  /** Average relative to par — the honest measure of a hard hole. */
  overPar: number | null;
  /** Whoever has the lowest average here, with at least two goes at it. */
  ownedBy: string | null;
}

export interface CourseHistory {
  courseName: string;
  city: string | null;
  state: string | null;
  roundsPlayed: number;
  regulars: CourseRegular[];
  lowRound: { name: string; strokes: number; roundId: string } | null;
  hardestHole: HoleRecord | null;
  holes: HoleRecord[];
}

/**
 * Everything the people you play with have done at one course.
 *
 * Reads only what RLS already allows, so this is "your crews' history here",
 * not a global leaderboard — a global one would need the rounds of strangers,
 * which the whole visibility model exists to prevent.
 */
export function useCourseHistory(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course', courseId ?? 'none', 'history'],
    enabled: Boolean(courseId),
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<CourseHistory> => {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, name, club_name, city, state')
        .eq('id', courseId!)
        .single();
      if (courseError) throw courseError;

      const base: CourseHistory = {
        courseName: courseLabel(course),
        city: course.city,
        state: course.state,
        roundsPlayed: 0,
        regulars: [],
        lowRound: null,
        hardestHole: null,
        holes: [],
      };

      const { data: rounds } = await supabase
        .from('rounds')
        .select('id, tee_id')
        .eq('course_id', courseId!)
        .eq('status', 'completed');

      const roundIds = (rounds ?? []).map((r) => r.id);
      if (roundIds.length === 0) return base;

      const [{ data: players }, { data: holes }] = await Promise.all([
        supabase
          .from('round_players')
          .select(
            'id, round_id, profile_id, guest_id, profiles(display_name), crew_guests(name), scores(hole_number, strokes)',
          )
          .in('round_id', roundIds),
        // Par comes from any tee played here; par does not vary by tee.
        supabase
          .from('holes')
          .select('number, par, tees!inner(course_id)')
          .eq('tees.course_id', courseId!),
      ]);

      const parByHole = new Map<number, number>();
      for (const hole of (holes ?? []) as unknown as Array<{ number: number; par: number }>) {
        if (!parByHole.has(hole.number)) parByHole.set(hole.number, hole.par);
      }

      const byPerson = new Map<string, CourseRegular & { grossTotal: number }>();
      const holeTotals = new Map<number, { strokes: number; count: number }>();
      const holeByPerson = new Map<number, Map<string, { strokes: number; count: number }>>();
      const nameByKey = new Map<string, string>();
      let lowRound: CourseHistory['lowRound'] = null;

      for (const row of (players ?? []) as unknown as Array<{
        id: string;
        round_id: string;
        profile_id: string | null;
        guest_id: string | null;
        profiles: { display_name: string } | null;
        crew_guests: { name: string } | null;
        scores: Array<{ hole_number: number; strokes: number | null }>;
      }>) {
        const scored = row.scores.filter((s) => s.strokes !== null);
        if (scored.length === 0) continue;

        const key = row.profile_id ? `p:${row.profile_id}` : `g:${row.guest_id}`;
        const name = row.profiles?.display_name ?? row.crew_guests?.name ?? 'Player';
        nameByKey.set(key, name);
        const gross = scored.reduce((sum, s) => sum + (s.strokes ?? 0), 0);

        for (const score of scored) {
          const total = holeTotals.get(score.hole_number) ?? { strokes: 0, count: 0 };
          total.strokes += score.strokes ?? 0;
          total.count += 1;
          holeTotals.set(score.hole_number, total);

          const perPerson = holeByPerson.get(score.hole_number) ?? new Map();
          const mine = perPerson.get(key) ?? { strokes: 0, count: 0 };
          mine.strokes += score.strokes ?? 0;
          mine.count += 1;
          perPerson.set(key, mine);
          holeByPerson.set(score.hole_number, perPerson);
        }

        const current =
          byPerson.get(key) ??
          ({
            key,
            name,
            roundsPlayed: 0,
            bestGross: gross,
            bestRoundId: row.round_id,
            scoringAverage: 0,
            grossTotal: 0,
          } as CourseRegular & { grossTotal: number });

        current.roundsPlayed += 1;
        current.grossTotal += gross;
        if (gross < current.bestGross) {
          current.bestGross = gross;
          current.bestRoundId = row.round_id;
        }
        byPerson.set(key, current);

        if (!lowRound || gross < lowRound.strokes) {
          lowRound = { name, strokes: gross, roundId: row.round_id };
        }
      }

      const holeRecords: HoleRecord[] = [...holeTotals.entries()]
        .map(([number, total]) => {
          const par = parByHole.get(number) ?? null;
          const average = total.strokes / total.count;

          // "Owns" needs more than one visit, or it is whoever got lucky once.
          let ownedBy: string | null = null;
          let bestAverage = Number.POSITIVE_INFINITY;
          for (const [key, stat] of holeByPerson.get(number) ?? []) {
            if (stat.count < 2) continue;
            const personAverage = stat.strokes / stat.count;
            if (personAverage < bestAverage) {
              bestAverage = personAverage;
              ownedBy = nameByKey.get(key) ?? null;
            }
          }

          return {
            number,
            par,
            averageStrokes: Math.round(average * 100) / 100,
            overPar: par === null ? null : Math.round((average - par) * 100) / 100,
            ownedBy,
          };
        })
        .sort((a, b) => a.number - b.number);

      const hardestHole =
        [...holeRecords]
          .filter((hole) => hole.overPar !== null)
          .sort((a, b) => (b.overPar ?? 0) - (a.overPar ?? 0))[0] ?? null;

      return {
        ...base,
        roundsPlayed: roundIds.length,
        regulars: [...byPerson.values()]
          .map((player) => ({
            ...player,
            scoringAverage: Math.round((player.grossTotal / player.roundsPlayed) * 10) / 10,
          }))
          .sort((a, b) => a.scoringAverage - b.scoringAverage),
        lowRound,
        hardestHole,
        holes: holeRecords,
      };
    },
  });
}
