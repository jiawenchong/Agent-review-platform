import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { getCurrentUserId, listUsers, setCurrentUserId, type ApiUser } from '../api/client';

const NAV_ITEMS = [
  { num: '01', label: '上傳資料', to: '/upload' },
  { num: '02', label: '專案儀表板', to: '/' },
  { num: '04', label: '通知中心', to: '/notifications', showBadge: true },
  { num: '05', label: '治理月報', to: '/report' },
  { num: '06', label: '紅線稽核紀錄', to: '/audit' },
];

export function Sidebar() {
  const { unreadCount } = useNotifications();
  const [users, setUsers] = useState<ApiUser[]>([]);

  useEffect(() => {
    listUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-eyebrow">Governance Platform</div>
        <div className="sidebar-title">Agent 開發<br />進度管控</div>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-num">{item.num}</span>
            <span>{item.label}</span>
            {item.showBadge && unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
          </NavLink>
        ))}
      </nav>
      {users.length > 0 && (
        <div className="sidebar-user-switch">
          <div className="sidebar-user-switch-label">目前身分(暫代登入)</div>
          <select
            className="sidebar-user-select"
            value={getCurrentUserId()}
            onChange={(e) => {
              setCurrentUserId(e.target.value);
              window.location.reload();
            }}
          >
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name}{u.is_manager ? '(主管)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="sidebar-footer">
        v1.0.0 · © 2026 Governance Platform
      </div>
    </aside>
  );
}
