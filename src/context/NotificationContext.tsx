import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { listNotifications, markNotificationRead, type ApiNotification } from '../api/client';

interface NotificationContextValue {
  notifications: ApiNotification[];
  unreadCount: number;
  loading: boolean;
  error: string;
  markRead: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listNotifications();
      setNotifications(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '讀取通知失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listNotifications()
      .then((list) => {
        if (!cancelled) {
          setNotifications(list);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '讀取通知失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markRead = useCallback(async (id: number) => {
    const target = notifications.find((n) => n.notification_id === id);
    if (!target || target.read_at) return;
    const updated = await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.notification_id === id ? updated : n)));
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, error, markRead, refresh }}>
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
