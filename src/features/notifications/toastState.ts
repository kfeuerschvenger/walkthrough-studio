/** Visual and semantic weight of a toast. */
export type ToastTone = 'error' | 'info';

/** One message shown to the user. */
export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

/** Most toasts kept on screen at once; the oldest is dropped first. */
export const MAX_TOASTS = 4;

/** How long a toast stays visible before it dismisses itself, in ms. */
export const TOAST_DURATION_MS = 6000;

/**
 * Adds a toast to the list, newest last.
 *
 * A toast whose message and tone match one already shown is not repeated:
 * the existing entry is replaced by the new one (fresh id, so its
 * auto-dismiss timer restarts). The list is capped at {@link MAX_TOASTS},
 * dropping the oldest.
 */
export function pushToast(toasts: readonly Toast[], toast: Toast): Toast[] {
  const rest = toasts.filter(
    (existing) => !(existing.message === toast.message && existing.tone === toast.tone),
  );
  return [...rest, toast].slice(-MAX_TOASTS);
}

/** Removes the toast with the given id. Unknown ids leave the list as is. */
export function dismissToast(toasts: readonly Toast[], id: number): Toast[] {
  return toasts.filter((toast) => toast.id !== id);
}
