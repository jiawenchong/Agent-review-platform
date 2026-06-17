import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { useNotifications } from '../context/NotificationContext';
import type { ApiNotificationType } from '../api/client';

const TYPE_STYLE: Record<ApiNotificationType, { color: string; bg: string; label: string }> = {
  停滯預警: { color: 'var(--amber-text)', bg: 'var(--amber-bg)', label: '預警' },
  升級通知: { color: 'var(--red-text)', bg: 'var(--red-bg)', label: '升級' },
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

export function Notifications() {
  const navigate = useNavigate();
  const { notifications, loading, error, markRead } = useNotifications();

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 04" title="通知中心" />
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div className="card" style={{ padding: '14px 18px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}>
            {error}
          </div>
        )}
        {loading && <div className="empty-state">載入中…</div>}
        {!loading && notifications.map((n) => {
          const unread = !n.read_at;
          const style = TYPE_STYLE[n.type];
          return (
            <div
              key={n.notification_id}
              className="notif-row"
              style={unread ? { borderLeft: `3px solid ${style.color}` } : undefined}
              onClick={() => navigate(`/projects/${n.project_id}`)}
            >
              <span
                className="chip"
                style={{ background: style.bg, color: style.color, cursor: 'default', border: 'none', flexShrink: 0 }}
              >
                {style.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{n.title}</span>
                  <span className="mono-id" style={{ marginLeft: 'auto' }}>{formatTs(n.sent_at)}</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>{n.body}</p>
              </div>
              {unread && (
                <button
                  className="mark-read-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    void markRead(n.notification_id);
                  }}
                >
                  標記已讀
                </button>
              )}
            </div>
          );
        })}
        {!loading && notifications.length === 0 && <div className="empty-state">目前沒有通知</div>}
      </div>
    </>
  );
}
