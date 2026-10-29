/**
 * Tracks which serialized scene the server holds, or will hold once the
 * requests already sent complete, so the autosave can skip a snapshot that
 * would change nothing.
 *
 * Two values are kept apart on purpose:
 * - `acknowledged` is the newest snapshot the server confirmed.
 * - `expected` is the newest snapshot handed to the server, confirmed or
 *   still in flight.
 *
 * The redundancy test uses `expected`. Comparing against `acknowledged`
 * would drop a revert to the acknowledged state while a newer snapshot is
 * in flight, and the server would end up with the newer one.
 */
export type SaveTracker = {
  /** Declares `serialized` as the state the server holds (hydration). */
  reset: (serialized: string) => void;
  /** True when sending `serialized` would not change what the server ends up with. */
  isRedundant: (serialized: string) => boolean;
  /** Registers a snapshot being sent and returns its sequence number. */
  begin: (serialized: string) => number;
  /** Registers the server's confirmation of the snapshot sent as `sequence`. */
  acknowledge: (sequence: number, serialized: string) => void;
  /**
   * Registers the failure of the snapshot sent as `sequence`. When it was the
   * newest send, the server is expected to hold the acknowledged state again,
   * so the next change saves instead of being skipped.
   */
  fail: (sequence: number) => void;
};

/** Creates an empty {@link SaveTracker}. */
export function createSaveTracker(): SaveTracker {
  let acknowledged: string | null = null;
  let expected: string | null = null;
  let acknowledgedSequence = 0;
  let latestSequence = 0;

  return {
    reset(serialized) {
      acknowledged = serialized;
      expected = serialized;
    },
    isRedundant(serialized) {
      return serialized === expected;
    },
    begin(serialized) {
      expected = serialized;
      return ++latestSequence;
    },
    acknowledge(sequence, serialized) {
      // Responses can arrive out of order; only a newer one moves forward.
      if (sequence <= acknowledgedSequence) return;
      acknowledgedSequence = sequence;
      acknowledged = serialized;
    },
    fail(sequence) {
      if (sequence === latestSequence) expected = acknowledged;
    },
  };
}
