/**
 * Asks the browser to lock the pointer to `canvas`.
 *
 * Browsers reject the request when the user re-locks too quickly after
 * leaving the lock (a `SecurityError`, as a rejected promise or, in older
 * engines, a synchronous throw). Neither is actionable: the user simply
 * clicks again. Both are swallowed so they never surface as uncaught
 * errors.
 */
export function requestCanvasPointerLock(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  try {
    const result: unknown = canvas.requestPointerLock();
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    /* legacy sync throw: ignore */
  }
}
