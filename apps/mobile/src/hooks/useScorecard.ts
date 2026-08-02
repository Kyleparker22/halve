import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  computeGame,
  type GameResult,
  type Player,
  type Score as EngineScore,
} from '@halve/games';
import type { LocalScore, RoundBundle, ScoreRow } from '@halve/types';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/query';
import { clientId } from '../lib/invite-code';
import {
  hydrateScores,
  pendingCount,
  readScores,
  recordScore,
  reconcileServerScore,
  useScorecardRevision,
} from '../lib/scorecard-store';
import { flushOutbox, isOnline, onSyncEvent, trackRound } from '../lib/sync';

export interface ScorecardEntry {
  strokes: number | null;
  putts: number | null;
  penalties: number | null;
  pending: boolean;
}

export interface PlayerTotals {
  roundPlayerId: string;
  holesPlayed: number;
  gross: number;
  net: number;
  toPar: number;
}

export interface MoneyLine {
  gameId: string;
  label: string;
  result: GameResult;
}

export interface Scorecard {
  entry(roundPlayerId: string, hole: number): ScorecardEntry;
  enter(roundPlayerId: string, hole: number, patch: Partial<ScorecardEntry>): void;
  totals: PlayerTotals[];
  moneyLine: MoneyLine[];
  pending: number;
  online: boolean;
  /** "Todd's 5 on 12 was replaced by Marcus's 4" — surfaced as a toast. */
  lastConflict: { hole: number; roundPlayerId: string } | null;
  dismissConflict(): void;
}

const EMPTY: ScorecardEntry = { strokes: null, putts: null, penalties: null, pending: false };

export function useScorecard(bundle: RoundBundle | undefined): Scorecard {
  const roundId = bundle?.round.id;
  const revision = useScorecardRevision();
  const [online, setOnline] = useState(isOnline());
  const [lastConflict, setLastConflict] = useState<Scorecard['lastConflict']>(null);

  // Server state, merged into local. Local unflushed writes win in the UI.
  useQuery({
    queryKey: queryKeys.roundScores(roundId ?? 'none'),
    enabled: Boolean(roundId && bundle?.roster.length),
    queryFn: async () => {
      const ids = bundle!.roster.map((p) => p.id);
      const { data, error } = await supabase.from('scores').select('*').in('round_player_id', ids);
      if (error) throw error;
      hydrateScores(roundId!, (data ?? []) as ScoreRow[]);
      return data ?? [];
    },
  });

  useEffect(() => onSyncEvent((event) => {
    if (event.type === 'online') setOnline(event.online);
    if (event.type === 'conflict') {
      setLastConflict({ hole: event.hole, roundPlayerId: event.roundPlayerId });
    }
  }), []);

  // Realtime is an enhancement. With the socket down the card works the same.
  useEffect(() => {
    if (!roundId || !bundle?.roster.length) return;
    const ids = bundle.roster.map((p) => p.id);
    const channel = supabase
      .channel(`round:${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
          filter: `round_player_id=in.(${ids.join(',')})`,
        },
        (payload) => {
          const row = payload.new as ScoreRow | undefined;
          if (row?.round_player_id) reconcileServerScore(roundId, row);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roundId, bundle?.roster]);

  const scores: Record<string, LocalScore> = useMemo(
    () => (roundId ? readScores(roundId) : {}),
    // revision is the store's change signal
    [roundId, revision],
  );

  const entry = useCallback(
    (roundPlayerId: string, hole: number): ScorecardEntry => {
      const local = scores[`${roundPlayerId}:${hole}`];
      if (!local) return EMPTY;
      return {
        strokes: local.strokes,
        putts: local.putts,
        penalties: local.penalties,
        pending: local.pending,
      };
    },
    [scores],
  );

  const enter = useCallback(
    (roundPlayerId: string, hole: number, patch: Partial<ScorecardEntry>) => {
      if (!roundId) return;
      const current = entry(roundPlayerId, hole);
      const id = clientId();
      trackRound(id, roundId);
      // Local first, always. The network is a background detail.
      recordScore(
        roundId,
        {
          roundPlayerId,
          hole,
          strokes: patch.strokes !== undefined ? patch.strokes : current.strokes,
          putts: patch.putts !== undefined ? patch.putts : current.putts,
          penalties: patch.penalties !== undefined ? patch.penalties : current.penalties,
        },
        id,
        new Date().toISOString(),
      );
      void flushOutbox();
    },
    [entry, roundId],
  );

  const engineScores: EngineScore[] = useMemo(
    () =>
      Object.values(scores).map((score) => ({
        roundPlayerId: score.roundPlayerId,
        hole: score.hole,
        strokes: score.strokes,
      })),
    [scores],
  );

  const totals: PlayerTotals[] = useMemo(() => {
    if (!bundle) return [];
    return bundle.roster.map((player) => {
      let gross = 0;
      let holesPlayed = 0;
      let par = 0;
      for (const hole of bundle.holes) {
        const local = scores[`${player.id}:${hole.number}`];
        if (!local || local.strokes === null) continue;
        gross += local.strokes;
        par += hole.par;
        holesPlayed += 1;
      }
      const handicap = player.playingHandicap ?? 0;
      // Net over the holes actually played, prorated by stroke allocation.
      const strokesTaken = allocatedOver(bundle, player.id, handicap, scores);
      return {
        roundPlayerId: player.id,
        holesPlayed,
        gross,
        net: gross - strokesTaken,
        toPar: gross - par,
      };
    });
  }, [bundle, scores]);

  const moneyLine: MoneyLine[] = useMemo(() => {
    if (!bundle) return [];
    const players: Player[] = bundle.roster.map((p) => ({
      roundPlayerId: p.id,
      playingHandicap: p.playingHandicap ?? 0,
      name: p.name,
    }));

    return bundle.games.map((game) => ({
      gameId: game.id,
      label: game.name ?? game.type,
      result: computeGame(game.config, bundle.holes, players, engineScores),
    }));
  }, [bundle, engineScores]);

  return {
    entry,
    enter,
    totals,
    moneyLine,
    pending: roundId ? pendingCount(roundId) : 0,
    online,
    lastConflict,
    dismissConflict: () => setLastConflict(null),
  };
}

/** Strokes received on the holes this player has actually finished. */
function allocatedOver(
  bundle: RoundBundle,
  roundPlayerId: string,
  handicap: number,
  scores: Record<string, LocalScore>,
): number {
  if (handicap === 0) return 0;
  const ranked = [...bundle.holes].sort(
    (a, b) => a.strokeIndex - b.strokeIndex || a.number - b.number,
  );
  const n = ranked.length || 1;
  const magnitude = Math.abs(handicap);
  const base = Math.floor(magnitude / n);
  const remainder = magnitude - base * n;
  const sign = handicap < 0 ? -1 : 1;

  let taken = 0;
  ranked.forEach((hole, i) => {
    const local = scores[`${roundPlayerId}:${hole.number}`];
    if (!local || local.strokes === null) return;
    const extra = sign > 0 ? (i < remainder ? 1 : 0) : i >= n - remainder ? 1 : 0;
    taken += sign * (base + extra);
  });
  return taken;
}
