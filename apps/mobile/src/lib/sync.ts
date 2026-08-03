/**
 * The sync engine. Drains the outbox with exponential backoff, inspects every
 * return value, and tells the user when their entry lost a race — on the tee
 * box, not at settlement.
 */
import NetInfo from '@react-native-community/netinfo';
import type {
  OutboxItem,
  ScoreRow,
  UpsertScoreArgs,
  UpsertScoreRpcArgs,
} from '@halve/types';
import { supabase } from './supabase';
import { captureError } from './analytics';
import {
  dequeue,
  markAttempt,
  readOutbox,
  reconcileServerScore,
  settle,
} from './scorecard-store';

export type SyncEvent =
  | { type: 'online'; online: boolean }
  | { type: 'flushed'; pending: number }
  | { type: 'conflict'; roundPlayerId: string; hole: number; strokes: number | null };

type Listener = (event: SyncEvent) => void;
const listeners = new Set<Listener>();

export function onSyncEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: SyncEvent): void {
  for (const listener of listeners) listener(event);
}

let online = true;
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function isOnline(): boolean {
  return online;
}

/** Rounds a queued write belongs to, so reconciliation lands in the right bucket. */
const roundForItem = new Map<string, string>();

export function trackRound(clientId: string, roundId: string): void {
  roundForItem.set(clientId, roundId);
}

const backoffMs = (attempts: number) => Math.min(30_000, 500 * 2 ** Math.min(attempts, 6));

async function flushItem(item: OutboxItem): Promise<'done' | 'retry'> {
  const roundId = roundForItem.get(item.id);

  const args: UpsertScoreArgs = {
    p_round_player_id: item.payload.roundPlayerId,
    p_hole_number: item.payload.hole,
    p_strokes: item.payload.strokes,
    p_putts: item.payload.putts,
    p_penalties: item.payload.penalties,
    p_client_id: item.payload.clientId,
    p_client_updated_at: item.payload.clientUpdatedAt,
    p_base_version: item.payload.baseVersion,
  };

  // The nulls are real and the database accepts them; only the generated
  // signature disagrees. See UpsertScoreArgs.
  const { data, error } = await supabase.rpc(
    'upsert_score',
    args as unknown as UpsertScoreRpcArgs,
  );

  if (error) {
    // A row the server rejects outright (RLS, a deleted round) will never
    // succeed. Drop it rather than retrying forever.
    const permanent = error.code === '42501' || error.code === '23503';
    markAttempt(item.id);
    if (permanent) {
      // Dropping a score is the most damaging thing this app can do quietly:
      // the golfer sees their number on the card, it never reaches the server,
      // and the first anyone knows is an argument about the total. If it has to
      // be discarded, it does not get discarded silently.
      captureError(error, {
        kind: 'score-dropped',
        code: error.code,
        roundPlayerId: item.payload.roundPlayerId,
        hole: item.payload.hole,
      });
    }
    return permanent ? 'done' : 'retry';
  }

  const row = data as unknown as ScoreRow | null;
  if (!row) return 'done';

  // Rule 3: inspect the return value. The conflict path is a successful call
  // that changed nothing and hands back the current server row.
  const lost = row.client_id !== item.payload.clientId;
  if (roundId) {
    settle(roundId, item.payload.roundPlayerId, item.payload.hole);
    const { changed } = reconcileServerScore(roundId, row);
    if (lost && changed) {
      emit({
        type: 'conflict',
        roundPlayerId: row.round_player_id,
        hole: row.hole_number,
        strokes: row.strokes,
      });
    }
  }
  return 'done';
}

export async function flushOutbox(): Promise<void> {
  if (flushing || !online) return;
  flushing = true;
  try {
    // In order: a later entry on the same hole already replaced the earlier one
    // at enqueue time, so order here is chronological across cells.
    for (const item of readOutbox()) {
      const outcome = await flushItem(item);
      if (outcome === 'done') {
        dequeue(item.id);
        roundForItem.delete(item.id);
      } else {
        scheduleRetry(item.attempts + 1);
        break;
      }
    }
    emit({ type: 'flushed', pending: readOutbox().length });
  } finally {
    flushing = false;
  }
}

function scheduleRetry(attempts: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOutbox();
  }, backoffMs(attempts));
}

let unsubscribeNetInfo: (() => void) | null = null;

export function startSyncEngine(): () => void {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const next = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (next === online) return;
    online = next;
    emit({ type: 'online', online });
    if (online) void flushOutbox();
  });

  void flushOutbox();

  return () => {
    unsubscribeNetInfo?.();
    unsubscribeNetInfo = null;
    if (retryTimer) clearTimeout(retryTimer);
  };
}
