/** Dependencies of {@link createScalePatcher}. */
export type ScalePatcherOptions = {
  /** Sends one scale to the server. Rejects when the server refuses it. */
  send: (id: string, scale: number, keepalive: boolean) => Promise<void>;
  /**
   * Called when a send failed and no newer scale is queued. `confirmed` is
   * the last scale the server accepted, the value the UI should roll back
   * to. Not called for a texture that was forgotten (deleted) meanwhile.
   */
  onFailure: (id: string, confirmed: number) => void;
  /** Quiet time after the last `schedule` before a scale is sent, in ms. */
  delayMs: number;
};

/** Debounced, per-texture scale sender. */
export type ScalePatcher = {
  /** Records the server's current scale for a texture (rollback target). */
  confirm: (id: string, scale: number) => void;
  /** Queues `scale` for the texture; the send happens after the debounce. */
  schedule: (id: string, scale: number) => void;
  /** Sends every queued scale right away (page close, unmount). */
  flush: () => void;
  /** Drops everything queued or remembered for a deleted texture. */
  forget: (id: string) => void;
};

/**
 * Debounces and orders the texture scale updates sent to the server.
 *
 * - A slider drag calls `schedule` on every tick; only the value the user
 *   settles on is sent, `delayMs` after the last call.
 * - Per texture, at most one request is in flight. A newer scale waits for
 *   the response of the older one, so the server applies them in the order
 *   the user made them and a late response can never overwrite a newer one.
 *   The one exception is `flush`: the page is going away, so the newest
 *   scale is sent immediately with `keepalive` even while an older request
 *   is still open. The accepted scale is the one of the highest-numbered
 *   send the server accepted, whatever order the responses arrive in, and
 *   only the newest send may trigger a rollback. When an older send is
 *   accepted after the newest one failed, the rollback is repeated with the
 *   scale the server actually holds.
 * - A failure rolls the texture back to the last scale the server
 *   accepted, unless a newer scale is already queued (its own outcome then
 *   decides).
 * - Once a texture is forgotten, no response for it touches the state.
 */
export function createScalePatcher({
  send,
  onFailure,
  delayMs,
}: ScalePatcherOptions): ScalePatcher {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, number>();
  /** Open requests per texture. */
  const inFlight = new Map<string, number>();
  const confirmed = new Map<string, number>();
  /** Sequence number of the newest request sent per texture. */
  const latestSend = new Map<string, number>();
  /** Sequence number of the newest accepted request per texture. */
  const acceptedSeq = new Map<string, number>();
  /** Textures whose newest send failed and has been rolled back. */
  const failedNewest = new Set<string>();
  let sendCounter = 0;

  function clearTimer(id: string): void {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
  }

  /**
   * Sends the queued scale of `id`. Without `overlap` it waits when a
   * request is already open; `flush` passes `overlap` to send regardless.
   * Follow-up sends inherit `keepalive`, so a scale queued behind an open
   * request during a flush is still sent with it.
   */
  function dispatch(id: string, keepalive: boolean, overlap = false): void {
    clearTimer(id);
    const scale = pending.get(id);
    if (scale === undefined) return;
    if (!overlap && (inFlight.get(id) ?? 0) > 0) return;
    pending.delete(id);
    const seq = ++sendCounter;
    latestSend.set(id, seq);
    inFlight.set(id, (inFlight.get(id) ?? 0) + 1);

    failedNewest.delete(id);

    send(id, scale, keepalive)
      .then(() => {
        // A forgotten texture has no `latestSend` entry. Among the accepted
        // sends the highest sequence is what the server holds, whatever
        // order the responses arrive in.
        if (!latestSend.has(id) || seq <= (acceptedSeq.get(id) ?? 0)) return;
        acceptedSeq.set(id, seq);
        confirmed.set(id, scale);
        // The newest send already failed and rolled the UI back to an older
        // scale; this late acceptance is what the server actually holds.
        if (failedNewest.has(id) && !pending.has(id)) onFailure(id, scale);
      })
      .catch(() => {
        if (latestSend.get(id) !== seq || pending.has(id)) return;
        const lastAccepted = confirmed.get(id);
        if (lastAccepted === undefined) return;
        failedNewest.add(id);
        onFailure(id, lastAccepted);
      })
      .finally(() => {
        const open = (inFlight.get(id) ?? 1) - 1;
        if (open > 0) inFlight.set(id, open);
        else inFlight.delete(id);
        if (open === 0 && pending.has(id)) dispatch(id, keepalive);
      });
  }

  return {
    confirm(id, scale) {
      confirmed.set(id, scale);
    },
    schedule(id, scale) {
      pending.set(id, scale);
      clearTimer(id);
      timers.set(
        id,
        setTimeout(() => dispatch(id, false), delayMs),
      );
    },
    flush() {
      for (const id of [...pending.keys()]) dispatch(id, true, true);
    },
    forget(id) {
      clearTimer(id);
      pending.delete(id);
      confirmed.delete(id);
      latestSend.delete(id);
      acceptedSeq.delete(id);
      failedNewest.delete(id);
    },
  };
}
