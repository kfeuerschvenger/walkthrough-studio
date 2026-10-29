import { useContext } from 'react';
import { NotificationsContext, type NotificationsContextValue } from './notificationsContext';

/**
 * Reads the notifications context. Throws outside `NotificationsProvider`:
 * that is a developer error, not a runtime case to recover from.
 */
export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) {
    throw new Error('useNotifications must be used inside <NotificationsProvider>');
  }
  return value;
}
