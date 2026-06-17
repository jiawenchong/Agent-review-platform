import { createContext, useContext, useState, type ReactNode } from 'react';
import { NOTIFICATIONS } from '../data/seed';

interface NotificationContextValue {
  unreadIds: Set<string>;
  unreadCount: number;
  markRead: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadIds, setUnreadIds] = useState<Set<string>>(
    () => new Set(NOTIFICATIONS.map((n) => n.id)),
  );

  const markRead = (id: string) => {
    setUnreadIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <NotificationContext.Provider value={{ unreadIds, unreadCount: unreadIds.size, markRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
