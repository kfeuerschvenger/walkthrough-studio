import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ToastRegion from '../../components/organisms/ToastRegion';
import { NotificationsContext, type NotificationsContextValue } from './notificationsContext';
import {
  TOAST_DURATION_MS,
  dismissToast,
  pushToast,
  type Toast,
  type ToastTone,
} from './toastState';

type Props = {
  children: ReactNode;
};

/**
 * Owns the list of toasts and renders them in a live region above the
 * rest of the app. Each toast dismisses itself after
 * {@link TOAST_DURATION_MS}; every pending timer is cleared on unmount.
 */
export default function NotificationsProvider({ children }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => dismissToast(current, id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'error') => {
      const id = nextIdRef.current++;
      setToasts((current) => pushToast(current, { id, message, tone }));
      timersRef.current.set(
        id,
        window.setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo<NotificationsContextValue>(() => ({ notify }), [notify]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </NotificationsContext.Provider>
  );
}
