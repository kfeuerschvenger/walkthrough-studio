import { createContext } from 'react';
import type { ToastTone } from './toastState';

/** What `NotificationsProvider` shares with the tree below it. */
export type NotificationsContextValue = {
  /** Shows a short message to the user. Errors are the default tone. */
  notify: (message: string, tone?: ToastTone) => void;
};

/** Context object behind `NotificationsProvider` and `useNotifications`. */
export const NotificationsContext = createContext<NotificationsContextValue | null>(null);
