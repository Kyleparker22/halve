/**
 * broadcast-call — writes one segment of the booth.
 *
 * Two announcers calling a round your friends are playing right now. The thing
 * that makes this work is that it never looks at the video: the app already
 * knows who is on which hole, what they scored, and what the money is, so a
 * missed birdie putt is a database row. A clip only supplies *which* moment to
 * talk about — the facts come from the scorecard.
 *
 * Storylines are the other input. "He was out late and his wife ran the tab up"
 * cannot be derived from anything we store, so the crew submits it before the
 * round and the announcers use it. That is where the comedy lives.
 *
 * The personas are original. Impersonating real broadcasters is a right-of-
 * publicity problem, and the joke does not need it.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.70.0';

interface Body {
  round_id: string;
  /** Optional: the clip that prompted this segment. */
  media_id?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * How hard the booth is allowed to go. Crew-controlled, because the line sits
 * somewhere different for every group — and an LLM with no ceiling will
 * eventually find the one thing that stops being funny.
 */
const ROAST: Record<string, string> = {
  gentle:
    'Keep it warm. Tease the golf, never the person. No comments about anyone\'s ' +
    'body, marriage, money troubles, or job.',
  spicy:
    'Give them the business the way old friends do — about their swing, their ' +
    'course management, their choices on the tee. Never about anyone\'s body, ' +
    'marriage, or finances beyond the bet itself.',
  brutal:
    'Merciless about the golf and the storylines the crew submitted. Still ' +
    'nothing about anyone\'s body, or about a real marriage or family beyond ' +
    'what the crew themselves wrote as a storyline.',
};

const SYSTEM = `You write short exchanges for a two-person golf broadcast booth
calling a casual round between friends.

The announcers:
- HAL — play-by-play. Sets the scene, calls the shot, keeps the score straight.
- MARCY — colour. Opinionated, dry, brings up history and storylines, needles people.

Rules that matter:
- Everything factual comes from the round state given to you. Never invent a
  score, a total, or a standing. If you are not told it, do not say it.
- Storylines are crew-submitted gossip and are fair game — that is the point.
- Two to four lines total. This plays while people drive to the next tee.
- Sound like a broadcast, not a chat app. No emoji, no hashtags, no stage
  directions.
- Never say anything about a person who is not in this round.

Return JSON only: {"script": [{"speaker": "HAL"|"MARCY", "line": "..."}]}`;

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY is not set' }, 500);

  const { round_id: roundId, media_id: mediaId } = (await request.json()) as Body;
  if (!roundId) return json({ error: 'round_id required' }, 400);

  // RLS answers "may this person see this round" — asking as them is the check.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: visible } = await caller.from('rounds').select('id').eq('id', roundId).maybeSingle();
  if (!visible) return json({ error: 'not found' }, 404);

  const admin = createClient(url, serviceKey);

  const { data: round } = await admin
    .from('rounds')
    .select('id, hole_count, crew_id, courses(name), crews(name, roast_level)')
    .eq('id', roundId)
    .single();
  if (!round) return json({ error: 'round not found' }, 404);

  const { data: players } = await admin
    .from('round_players')
    .select('id, profiles(display_name), crew_guests(name), playing_handicap, scores(hole_number, strokes)')
    .eq('round_id', roundId)
    .order('position');

  const { data: holes } = await admin
    .from('holes')
    .select('number, par, tees!inner(id)')
    .eq('tee_id', (round as { tee_id?: string }).tee_id ?? '')
    .order('number');

  const parByHole = new Map<number, number>();
  for (const hole of (holes ?? []) as Array<{ number: number; par: number }>) {
    parByHole.set(hole.number, hole.par);
  }

  const { data: storylines } = await admin
    .from('round_storylines')
    .select('body, subject_player_id')
    .eq('round_id', roundId);

  // The money so far, which is what the booth is really tracking.
  const { data: results } = await admin
    .from('game_results')
    .select('round_player_id, amount_cents, games!inner(round_id)')
    .eq('games.round_id', roundId);

  const moneyBy = new Map<string, number>();
  for (const row of (results ?? []) as Array<{ round_player_id: string; amount_cents: number }>) {
    moneyBy.set(row.round_player_id, (moneyBy.get(row.round_player_id) ?? 0) + row.amount_cents);
  }

  let clip: { hole_number: number | null; subject_player_id: string | null; caption: string | null } | null =
    null;
  if (mediaId) {
    const { data } = await admin
      .from('round_media')
      .select('hole_number, subject_player_id, caption')
      .eq('id', mediaId)
      .eq('round_id', roundId)
      .maybeSingle();
    clip = data;
  }

  const roster = ((players ?? []) as Array<{
    id: string;
    profiles: { display_name: string } | null;
    crew_guests: { name: string } | null;
    playing_handicap: number | null;
    scores: Array<{ hole_number: number; strokes: number | null }>;
  }>).map((player) => {
    const scored = player.scores.filter((s) => s.strokes !== null);
    const gross = scored.reduce((sum, s) => sum + (s.strokes ?? 0), 0);
    const parSoFar = scored.reduce((sum, s) => sum + (parByHole.get(s.hole_number) ?? 4), 0);
    return {
      id: player.id,
      name: player.profiles?.display_name ?? player.crew_guests?.name ?? 'Player',
      thru: scored.length,
      gross,
      toPar: gross - parSoFar,
      playsOff: player.playing_handicap,
      moneyCents: moneyBy.get(player.id) ?? 0,
      lastHole: scored.length > 0 ? scored[scored.length - 1] : null,
    };
  });

  const nameOf = (id: string | null) => roster.find((p) => p.id === id)?.name ?? null;

  const state = {
    course: (round as { courses?: { name?: string } }).courses?.name ?? 'the course',
    holeCount: round.hole_count,
    leaderboard: [...roster].sort((a, b) => a.toPar - b.toPar),
    storylines: ((storylines ?? []) as Array<{ body: string; subject_player_id: string }>).map(
      (s) => ({ about: nameOf(s.subject_player_id), says: s.body }),
    ),
    // What prompted this segment, if anything did.
    clip: clip
      ? {
          about: nameOf(clip.subject_player_id),
          hole: clip.hole_number,
          par: clip.hole_number ? (parByHole.get(clip.hole_number) ?? null) : null,
          caption: clip.caption,
          scoredOnThatHole:
            clip.subject_player_id && clip.hole_number
              ? (players ?? [])
                  .find((p) => (p as { id: string }).id === clip!.subject_player_id)
                  ?.scores?.find(
                    (s: { hole_number: number }) => s.hole_number === clip!.hole_number,
                  )?.strokes ?? null
              : null,
        }
      : null,
  };

  const roastLevel =
    (round as { crews?: { roast_level?: string } }).crews?.roast_level ?? 'spicy';

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  let script: Array<{ speaker: string; line: string }>;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      // A segment plays while people are driving to the next tee — this is a
      // latency-sensitive path, and the writing does not need deep reasoning.
      output_config: { effort: 'low' },
      system: `${SYSTEM}\n\nTone for this crew: ${ROAST[roastLevel] ?? ROAST.spicy}`,
      messages: [
        {
          role: 'user',
          content: `Round state:\n${JSON.stringify(state, null, 2)}\n\n${
            state.clip
              ? 'Call the moment in `clip`, then react to it.'
              : 'No clip — give a leaderboard update and needle whoever deserves it.'
          }`,
        },
      ],
    });

    if (message.stop_reason === 'refusal') {
      return json({ error: 'declined', reason: message.stop_details }, 422);
    }

    const text = message.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') throw new Error('no text block in response');
    // The model is told to return JSON only, but a stray fence is cheap to survive.
    const parsed = JSON.parse(text.text.replace(/^```(?:json)?\n?|\n?```$/g, '')) as {
      script: Array<{ speaker: string; line: string }>;
    };
    script = parsed.script;
    if (!Array.isArray(script) || script.length === 0) throw new Error('empty script');
  } catch (error) {
    console.error('segment generation failed', error);
    return json({ error: 'could not write a segment' }, 502);
  }

  const { data: segment, error } = await admin
    .from('broadcast_segments')
    .insert({
      round_id: roundId,
      media_id: mediaId ?? null,
      hole_number: clip?.hole_number ?? null,
      script,
    })
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);

  // Mark the clip called, so the booth does not do the same putt twice.
  if (mediaId) {
    await admin
      .from('round_media')
      .update({ used_at: new Date().toISOString() })
      .eq('id', mediaId);
  }

  return json({ segment });
});
