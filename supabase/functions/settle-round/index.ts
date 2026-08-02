/**
 * settle-round — the authoritative money computation.
 *
 * Recomputes every game on a round with the SAME @halve/games build the phone
 * used (copied verbatim into _shared by `pnpm build:functions`), writes
 * game_results, decomposes them into ledger entries with @halve/ledger, and
 * marks the round completed.
 *
 * Nothing here reimplements a rule. If this file ever contains scoring logic,
 * the "my phone said I won" bug is already shipped.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { computeGame, partitionBreakdown } from '../_shared/games/index.ts';
import type { GameConfig, Player, Score } from '../_shared/games/index.ts';
import { gameResultsToLedger } from '../_shared/ledger/index.ts';

interface Body {
  round_id: string;
  /** Re-settle a round that is already completed. Rewrites results and entries. */
  force?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { round_id: roundId, force = false } = (await request.json()) as Body;
  if (!roundId) return json({ error: 'round_id required' }, 400);

  // Caller's own client: RLS decides whether they may see this round at all.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: visible, error: visibleError } = await caller
    .from('rounds')
    .select('id, status, crew_id, trip_id, tee_id, hole_count, nine')
    .eq('id', roundId)
    .maybeSingle();

  if (visibleError) return json({ error: visibleError.message }, 400);
  if (!visible) return json({ error: 'round not found' }, 404);
  if (visible.status === 'completed' && !force) {
    return json({ error: 'round already settled' }, 409);
  }
  if (!visible.crew_id) {
    return json({ error: 'a round with no crew has no ledger to write to' }, 400);
  }

  // Service role for the writes. Never exposed to the app.
  const admin = createClient(url, serviceKey);

  const [{ data: holeRows }, { data: playerRows }, { data: gameRows }] = await Promise.all([
    admin.from('holes').select('number, par, stroke_index').eq('tee_id', visible.tee_id),
    admin
      .from('round_players')
      .select('id, profile_id, guest_id, playing_handicap, crew_guests(vouched_by)')
      .eq('round_id', roundId),
    admin
      .from('games')
      .select('id, type, config, game_participants(round_player_id, team_id)')
      .eq('round_id', roundId),
  ]);

  const allHoles = (holeRows ?? []).map((hole: Record<string, number>) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.stroke_index,
  }));
  const holes =
    visible.hole_count === 9
      ? allHoles.filter((hole) => (visible.nine === 'back' ? hole.number > 9 : hole.number <= 9))
      : allHoles;

  if (holes.length === 0) {
    return json({ error: 'this round has no hole data to score against' }, 400);
  }

  const roster = playerRows ?? [];
  const { data: scoreRows } = await admin
    .from('scores')
    .select('round_player_id, hole_number, strokes')
    .in(
      'round_player_id',
      roster.map((player: { id: string }) => player.id),
    );

  const scores: Score[] = (scoreRows ?? []).map(
    (row: { round_player_id: string; hole_number: number; strokes: number | null }) => ({
      roundPlayerId: row.round_player_id,
      hole: row.hole_number,
      strokes: row.strokes,
    }),
  );

  // A guest's money resolves to the profile who vouched for them.
  const identities = roster
    .map((player: { id: string; profile_id: string | null; crew_guests: { vouched_by: string } | null }) => ({
      roundPlayerId: player.id,
      profileId: player.profile_id ?? player.crew_guests?.vouched_by ?? null,
    }))
    .filter((identity): identity is { roundPlayerId: string; profileId: string } =>
      Boolean(identity.profileId),
    );

  const names = Object.fromEntries(roster.map((player: { id: string }) => [player.id, 'Player']));

  let ledgerWritten = 0;
  const settledGames: string[] = [];

  for (const game of gameRows ?? []) {
    const participants = (game.game_participants ?? []) as Array<{
      round_player_id: string;
      team_id: string | null;
    }>;
    const playing = participants.length
      ? participants.map((p) => p.round_player_id)
      : roster.map((p: { id: string }) => p.id);

    const players: Player[] = roster
      .filter((player: { id: string }) => playing.includes(player.id))
      .map((player: { id: string; playing_handicap: number | null }) => {
        const team = participants.find((p) => p.round_player_id === player.id)?.team_id ?? undefined;
        return {
          roundPlayerId: player.id,
          playingHandicap: player.playing_handicap ?? 0,
          ...(team ? { teamId: team } : {}),
        };
      });

    if (players.length < 2) continue;

    const result = computeGame(game.config as GameConfig, holes, players, scores);
    const partitioned = partitionBreakdown(result, names);

    // Clearing first keeps a re-settle idempotent. The sum-to-zero constraint
    // trigger validates the replacement insert as a set, at commit.
    await admin.from('game_results').delete().eq('game_id', game.id);

    const { error: resultError } = await admin.from('game_results').insert(
      result.perPlayer.map((entry) => ({
        game_id: game.id,
        round_player_id: entry.roundPlayerId,
        amount_cents: entry.amountCents,
        breakdown: partitioned[entry.roundPlayerId] ?? { summary: '', lines: [] },
      })),
    );
    if (resultError) return json({ error: `game ${game.id}: ${resultError.message}` }, 400);

    await admin.from('games').update({ computed_at: new Date().toISOString() }).eq('id', game.id);

    // §7.2: resolve guests to vouchers, net, drop zeroes, decompose.
    const drafts = gameResultsToLedger(result.perPlayer, identities);
    if (drafts.length > 0) {
      await admin.from('ledger_entries').delete().eq('source_id', game.id).eq('status', 'open');
      const { error: ledgerError } = await admin.from('ledger_entries').insert(
        drafts.map((draft) => ({
          crew_id: visible.crew_id,
          trip_id: visible.trip_id,
          from_profile: draft.fromProfile,
          to_profile: draft.toProfile,
          amount_cents: draft.amountCents,
          source_type: 'game',
          source_id: game.id,
          note: null,
        })),
      );
      if (ledgerError) return json({ error: `ledger: ${ledgerError.message}` }, 400);
      ledgerWritten += drafts.length;
    }

    settledGames.push(game.id);
  }

  await admin
    .from('rounds')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', roundId);

  // Feed and notifications are fan-out-on-write; the feed must never join.
  await admin.from('feed_items').insert({
    crew_id: visible.crew_id,
    actor_id: null,
    type: 'round_completed',
    subject_type: 'round',
    subject_id: roundId,
    payload: { games: settledGames.length, ledgerEntries: ledgerWritten },
  });

  for (const identity of identities) {
    await admin.rpc('enqueue_notification', {
      p_profile: identity.profileId,
      p_kind: 'round_completed',
      p_title: 'Round settled',
      p_body: 'The card is closed and the money is worked out.',
      p_data: { round_id: roundId },
    });
  }

  return json({ games: settledGames.length, ledgerEntries: ledgerWritten });
});
