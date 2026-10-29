import ToastItem from '../molecules/ToastItem';
import type { Toast } from '../../features/notifications/toastState';

type Props = {
  toasts: readonly Toast[];
  onDismiss: (id: number) => void;
};

/**
 * Fixed live region that lists the active toasts.
 *
 * The region is always mounted, even when empty: assistive technology
 * only announces changes inside a live region that already exists, so a
 * region created together with its first message would stay silent.
 * `role="status"` is polite, so a notice never interrupts what the user
 * is doing.
 */
export default function ToastRegion({ toasts, onDismiss }: Props) {
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  );
}
