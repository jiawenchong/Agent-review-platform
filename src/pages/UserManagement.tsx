import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { listUsers, updateUserRole, type ApiRole, type ApiUser } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLE_LABEL: Record<ApiRole, string> = {
  admin: '管理員 (admin)',
  manager: '主管 (manager)',
  member: '成員 (member)',
};

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listUsers()
      .then((us) => {
        setUsers(us);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : '讀取使用者清單失敗'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleRoleChange = async (userId: string, role: ApiRole) => {
    setSavingId(userId);
    setError('');
    try {
      const updated = await updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.user_id === userId ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新角色失敗');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 08" title="使用者管理" />
      <div className="page-body">
        {error && (
          <div className="card" style={{ marginBottom: 16, padding: '14px 18px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}>
            {error}
          </div>
        )}

        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="empty-state">載入中…</div>
          ) : users.length === 0 ? (
            <div className="empty-state">尚無使用者（AD 登入後會自動出現在這裡）</div>
          ) : (
            users.map((u) => (
              <div className="audit-row" key={u.user_id}>
                <div className="audit-row-body">
                  <div className="audit-row-head">
                    <span style={{ fontWeight: 600 }}>{u.name}</span>
                    {u.empno && <span className="mono-id">{u.empno}</span>}
                    {u.user_id === currentUser?.user_id && (
                      <span className="chip" style={{ cursor: 'default' }}>你自己</span>
                    )}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select
                        className="role-select"
                        value={u.role ?? 'member'}
                        disabled={savingId === u.user_id}
                        onChange={(e) => handleRoleChange(u.user_id, e.target.value as ApiRole)}
                      >
                        {(Object.keys(ROLE_LABEL) as ApiRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
