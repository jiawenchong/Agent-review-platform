import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

interface Props {
  onSuccess: () => void;
}

export function Login({ onSuccess }: Props) {
  const { refresh } = useAuth();
  const [empno, setEmpno] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empno.trim() || !password) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empno: empno.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `登入失敗 (HTTP ${res.status})`);
      }
      await refresh();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登入失敗，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-eyebrow">Governance Platform</div>
          <div className="login-title">Agent 開發進度管控</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
          <div className="login-field">
            <label className="login-label" htmlFor="empno">員工編號</label>
            <input
              id="empno"
              className="login-input"
              type="text"
              value={empno}
              onChange={(e) => setEmpno(e.target.value)}
              placeholder="請輸入員工編號"
              autoFocus
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="password">密碼（Windows AD 密碼）</label>
            <input
              id="password"
              className="login-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="login-error">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4h1.5v4.5h-1.5V5zm0 5.5h1.5V12h-1.5v-1.5z" />
              </svg>
              {error}
            </div>
          )}

          <button
            className="btn btn-primary login-submit"
            type="submit"
            disabled={isLoading || !empno.trim() || !password}
          >
            {isLoading ? (
              <>
                <span className="vr-spinner" />
                登入中…
              </>
            ) : '登入'}
          </button>
        </form>

        <div className="login-footer">
          使用 Windows AD 帳號登入 · 僅限授權人員使用
        </div>
      </div>
    </div>
  );
}
