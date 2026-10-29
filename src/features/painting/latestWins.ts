/** Reports whether a newer call has been made since the current run started. */
export type StaleCheck = () => boolean;

/** Options for {@link createLatestWinsRunner}. */
export type LatestWinsOptions = {
  /** Receives a failure of the task. Defaults to `console.warn`. */
  onError?: (error: unknown) => void;
};

/**
 * Wraps an async task so overlapping calls are serialized with latest-wins
 * semantics.
 *
 * - At most one run is in flight at any time, so two runs can never
 *   interleave their awaits and race on shared state.
 * - A call made while a run is in flight replaces any call still waiting,
 *   so a burst of N calls costs one run in flight plus one final run with
 *   the newest arguments.
 * - The in-flight run is told it is stale through the `isStale` callback
 *   the moment a newer call arrives, so it can stop at its next checkpoint
 *   instead of finishing work that is about to be redone.
 *
 * The returned function resolves once the chain has drained, meaning the
 * newest arguments seen at the time of the call have been processed.
 * A failing run is reported through `onError` and does not block the next.
 */
export function createLatestWinsRunner<A extends unknown[]>(
  task: (isStale: StaleCheck, ...args: A) => Promise<void>,
  options: LatestWinsOptions = {},
): (...args: A) => Promise<void> {
  const onError =
    options.onError ?? ((error: unknown) => console.warn('[latestWins] run failed', error));

  let generation = 0;
  let pending: A | null = null;
  let chain: Promise<void> | null = null;

  async function drain(): Promise<void> {
    try {
      while (pending) {
        const args = pending;
        pending = null;
        const startedAt = generation;
        try {
          await task(() => generation !== startedAt, ...args);
        } catch (error) {
          onError(error);
        }
      }
    } finally {
      chain = null;
    }
  }

  return (...args: A) => {
    generation += 1;
    pending = args;
    chain ??= drain();
    return chain;
  };
}
