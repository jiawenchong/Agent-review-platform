import { NavLink } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  num: string;
  label: string;
  to: string;
  showBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { num: '01', label: '規劃書評估', to: '/upload' },
  { num: '02', label: '專案儀表板', to: '/' },
  { num: '04', label: '通知中心', to: '/notifications', showBadge: true },
  { num: '05', label: '治理月報', to: '/report' },
  { num: '06', label: '紅線稽核紀錄', to: '/audit' },
  { num: '07', label: 'AI 驗證報告', to: '/validation-report' },
];

const ADMIN_NAV_ITEM: NavItem = { num: '08', label: '使用者管理', to: '/users' };

export function Sidebar() {
  const { unreadCount } = useNotifications();
  const { user, isManager, isAdmin, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const roleBadge = isManager ? '主管' : '成員';
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-eyebrow">Governance Platform</div>
        <div className="sidebar-title">Agent 開發<br />進度管控</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
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
      {user && (
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-meta">
              {user.empno && <span className="sidebar-user-empno">{user.empno}</span>}
              <span className="sidebar-user-role">{roleBadge}</span>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout} title="登出">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3v-1.5H3.5v-9H6V2zm4.78 3.72l2.53 2.53-2.53 2.53-1.06-1.06 1.22-1.22H6V7h4.94l-1.22-1.22 1.06-1.06z" />
            </svg>
            登出
          </button>
        </div>
      )}
      <div className="sidebar-footer">
        v1.0.0 · © 2026 Governance Platform
      </div>
    </aside>
  );
}
