/**
 * The offline scorecard. This is the part of the app that cannot fail.
 *
 * Rules, from 02 Technical Spec §6:
 *   1. Every entry writes to local state first and renders instantly. The
 *      scorecard never awaits the network.
 *   2. Every flush sends the COMPLETE row (strokes, putts, penalties) merged
 *      from last-known server state. The upsert overwrites all three.
 *   3. Every flush INSPECTS the return value. A lost conflict is a successful
 *      call that changed nothing; treating a 2xx as confirmation is how scores
 *      silently diverge.
 *   4. Conflicts resolve by server-assigned version, never by client clock.
 */
import { useSyncExternalStore } from 'react';
import type { LocalScore, OutboxItem, ScoreDraft, ScoreRow } from '@halve/types';
import { readJson, scoreStore, writeJson } from './storage';

const scoreKey = (roundId: string) => `round.${roundId}.scores`;
const OUTBOX_KEY = 'outbox';

type ScoreMap = Record<string, LocalScore>;

const cellKey = (roundPlayerId: string, hole: number) => `${roundPlayerId}:${hole}`;

const listeners = new Set<() => void>();
/** Bumped on every mutation so useSyncExternalStore re-renders subscribers. */
let revision = 0;

function emit(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRevision(): number {
  return revision;
}

// ---------------------------------------------------------------------------
// Local score state
// ---------------------------------------------------------------------------

export function readScores(roundId: string): ScoreMap {
  return readJson<ScoreMap>(scoreStore, scoreKey(roundId), {});
}

function writeScores(roundId: string, scores: ScoreMap): void {
  writeJson(scoreStore, scoreKey(roundId), scores);
  emit();
}

export function getScore(roundId: string, roundPlayerId: string, hole: number): LocalScore | null {
  return readScores(roundId)[cellKey(roundPlayerId, hole)] ?? null;
}

/**
 * Record an entry. Returns immediately; the network happens later.
 * `clientId` is the idempotency key for this write.
 */
export function recordScore(
  roundId: string,
  draft: ScoreDraft,
  clientId: string,
  now: string,
): void {
  const scores = readScores(roundId);
  const key = cellKey(draft.roundPlayerId, draft.hole);
  const existing = scores[key];

  scores[key] = {
    roundPlayerId: draft.roundPlayerId,
    hole: draft.hole,
    // Rule 2: the complete row, merged over whatever we already hold.
    strokes: draft.strokes ?? null,
    putts: draft.putts ?? existing?.putts ?? null,
    penalties: draft.penalties ?? existing?.penalties ?? null,
    version: existing?.version ?? 0,
    pending: true,
    clientId,
    updatedAt: now,
  };
  writeScores(roundId, scores);

  enqueue({
    id: clientId,
    kind: 'score',
    payload: {
      ...draft,
      putts: scores[key]!.putts,
      penalties: scores[key]!.penalties,
      clientId,
      baseVersion: existing?.version ?? 0,
      clientUpdatedAt: now,
    },
    attempts: 0,
    queuedAt: now,
  });
}

/**
 * Reconcile against a row the server returned or pushed over Realtime.
 * A local write that is still pending wins in the UI; one that already flushed
 * must yield, because it lost a version race and is no longer the truth.
 */
export function reconcileServerScore(roundId: string, row: ScoreRow): { changed: boolean } {
  const scores = readScores(roundId);
  const key = cellKey(row.round_player_id, row.hole_number);
  const local = scores[key];

  if (local?.pending && local.clientId !== row.client_id) {
    // Our write has not been sent yet. Keep showing it, but remember the
    // version we now have to build on, or the flush will lose on purpose.
    scores[key] = { ...local, version: Number(row.version) };
    writeScores(roundId, scores);
    return { changed: false };
  }

  const next: LocalScore = {
    roundPlayerId: row.round_player_id,
    hole: row.hole_number,
    strokes: row.strokes,
    putts: row.putts,
    penalties: row.penalties,
    version: Number(row.version),
    pending: false,
    clientId: row.client_id,
    updatedAt: row.updated_at ?? row.client_updated_at,
  };

  const changed =
    !local ||
    local.strokes !== next.strokes ||
    local.putts !== next.putts ||
    local.penalties !== next.penalties;

  scores[key] = next;
  writeScores(roundId, scores);
  return { changed };
}

export function hydrateScores(roundId: string, rows: ScoreRow[]): void {
  for (const row of rows) reconcileServerScore(roundId, row);
}

export function pendingCount(roundId: string): number {
  return Object.values(readScores(roundId)).filter((s) => s.pending).length;
}

export function clearRound(roundId: string): void {
  scoreStore.remove(scoreKey(roundId));
  emit();
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export function readOutbox(): OutboxItem[] {
  return readJson<OutboxItem[]>(scoreStore, OUTBOX_KEY, []);
}

function writeOutbox(items: OutboxItem[]): void {
  writeJson(scoreStore, OUTBOX_KEY, items);
  emit();
}

function enqueue(item: OutboxItem): void {
  const items = readOutbox();
  // One pending write per cell: a later entry on the same hole replaces the
  // earlier one rather than queueing a stale value behind it.
  const targetCell = cellKey(item.payload.roundPlayerId, item.payload.hole);
  const filtered = items.filter(
    (existing) => cellKey(existing.payload.roundPlayerId, existing.payload.hole) !== targetCell,
  );
  filtered.push(item);
  writeOutbox(filtered);
}

export function dequeue(id: string): void {
  writeOutbox(readOutbox().filter((item) => item.id !== id));
}

export function markAttempt(id: string): void {
  writeOutbox(
    readOutbox().map((item) => (item.id === id ? { ...item, attempts: item.attempts + 1 } : item)),
  );
}

/** Mark a cell as no longer pending — its write landed or was superseded. */
export function settle(roundId: string, roundPlayerId: string, hole: number): void {
  const scores = readScores(roundId);
  const key = cellKey(roundPlayerId, hole);
  const local = scores[key];
  if (!local) return;
  scores[key] = { ...local, pending: false };
  writeScores(roundId, scores);
}

// ---------------------------------------------------------------------------
// React binding
// ---------------------------------------------------------------------------

export function useScorecardRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision);
}
