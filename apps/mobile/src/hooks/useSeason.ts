import { useQuery } from '@tanstack/react-query';
import { netPositions, type LedgerEntryDraft } from '@halve/ledger';
import { supabase } from '../lib/supabase';

export interface SeasonPlayer {
  key: string;
  profileId: string | null;
  name: string;
  isGuest: boolean;
  roundsPlayed: number;
  scoringAverage: number | null;
  bestGross: number | null;
  bestRoundId: string | null;
  /** Signed, across every settled and open entry in the season. */
  netCents: number;
}

export interface SeasonSummary {
  year: number;
  players: SeasonPlayer[];
  roundsPlayed: number;
  /** Lowest single round anyone posted. */
  lowRound: { name: string; strokes: number; roundId: string } | null;
  /** Biggest single-round win. */
  biggestWin: { name: string; amountCents: number; roundId: string } | null;
}

/** Calendar year. A golf season is not a calendar year everywhere, but it is the
 * only boundary that needs no configuration and no explaining. */
export const currentSeason = (): number => new Date().getFullYear();

/**
 * A crew's season: who has played, who is scoring well, and who is up.
 *
 * Computed on the client rather than in a new database view, deliberately. Every
 * table it reads is already covered by RLS, so a signed-in user can only ever
 * aggregate rounds they are allowed to see — a new security-definer view would
 * be another surface that has to be proven not to leak, for arithmetic that is
 * cheap on a season's worth of rows.
 */
export function useCrewSeason(crewId: string | undefined, year: number = currentSeason()) {
  return useQuery({
    queryKey: ['crew', crewId ?? 'none', 'season', year],
    enabled: Boolean(crewId),
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<SeasonSummary> => {
      const from = `${year}-01-01T00:00:00Z`;
      const to = `${year + 1}-01-01T00:00:00Z`;

      const { data: rounds, error: roundsError } = await supabase
        .from('rounds')
        .select('id')
        .eq('crew_id', crewId!)
        .eq('status', 'completed')
        .gte('scheduled_at', from)
        .lt('scheduled_at', to);
      if (roundsError) throw roundsError;

      const roundIds = (rounds ?? []).map((r) => r.id);
      const empty: SeasonSummary = {
        year,
        players: [],
        roundsPlayed: 0,
        lowRound: null,
        biggestWin: null,
      };
      if (roundIds.length === 0) return empty;

      const [{ data: players, error: playersError }, { data: entries }] = await Promise.all([
        supabase
          .from('round_players')
          .select(
            'id, round_id, profile_id, guest_id, profiles(display_name), crew_guests(name), scores(strokes), game_results(amount_cents)',
          )
          .in('round_id', roundIds),
        supabase
          .from('ledger_entries')
          .select('from_profile, to_profile, amount_cents')
          .eq('crew_id', crewId!)
          .gte('created_at', from)
          .lt('created_at', to),
      ]);
      if (playersError) throw playersError;

      const byPerson = new Map<string, SeasonPlayer & { grossTotal: number }>();
      let lowRound: SeasonSummary['lowRound'] = null;
      let biggestWin: SeasonSummary['biggestWin'] = null;

      for (const row of (players ?? []) as unknown as Array<{
        id: string;
        round_id: string;
        profile_id: string | null;
        guest_id: string | null;
        profiles: { display_name: string } | null;
        crew_guests: { name: string } | null;
        scores: Array<{ strokes: number | null }>;
        game_results: Array<{ amount_cents: number }>;
      }>) {
        const scored = row.scores.filter((s) => s.strokes !== null);
        // Money without a card still counts; a card with no holes does not.
        const gross = scored.reduce((sum, s) => sum + (s.strokes ?? 0), 0);
        const roundMoney = row.game_results.reduce((sum, r) => sum + r.amount_cents, 0);
        if (scored.length === 0 && row.game_results.length === 0) continue;

        const key = row.profile_id ? `p:${row.profile_id}` : `g:${row.guest_id}`;
        const name = row.profiles?.display_name ?? row.crew_guests?.name ?? 'Player';

        const current =
          byPerson.get(key) ??
          ({
            key,
            profileId: row.profile_id,
            name,
            isGuest: row.guest_id !== null,
            roundsPlayed: 0,
            scoringAverage: null,
            bestGross: null,
            bestRoundId: null,
            netCents: 0,
            grossTotal: 0,
          } as SeasonPlayer & { grossTotal: number });

        if (scored.length > 0) {
          current.roundsPlayed += 1;
          current.grossTotal += gross;
          if (current.bestGross === null || gross < current.bestGross) {
            current.bestGross = gross;
            current.bestRoundId = row.round_id;
          }
          if (!lowRound || gross < lowRound.strokes) {
            lowRound = { name, strokes: gross, roundId: row.round_id };
          }
        }
        if (!biggestWin || roundMoney > biggestWin.amountCents) {
          if (roundMoney > 0) biggestWin = { name, amountCents: roundMoney, roundId: row.round_id };
        }
        byPerson.set(key, current);
      }

      /**
       * Money comes from the ledger rather than from game_results, because the
       * ledger is what people actually owe: it has guests resolved to their
       * vouchers and trip expenses folded in. Summing game_results would show a
       * guest's winnings against a person who cannot be paid.
       */
      const drafts: LedgerEntryDraft[] = ((entries ?? []) as Array<{
        from_profile: string;
        to_profile: string;
        amount_cents: number;
      }>).map((entry) => ({
        fromProfile: entry.from_profile,
        toProfile: entry.to_profile,
        amountCents: entry.amount_cents,
      }));
      const money = new Map(netPositions(drafts).map((p) => [p.profileId, p.netCents]));

      const result = [...byPerson.values()].map((player) => ({
        ...player,
        scoringAverage:
          player.roundsPlayed > 0
            ? Math.round((player.grossTotal / player.roundsPlayed) * 10) / 10
            : null,
        netCents: player.profileId ? (money.get(player.profileId) ?? 0) : 0,
      }));

      return {
        year,
        players: result.sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name)),
        roundsPlayed: roundIds.length,
        lowRound,
        biggestWin,
      };
    },
  });
}
