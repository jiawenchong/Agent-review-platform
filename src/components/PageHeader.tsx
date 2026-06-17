import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="eyebrow">{eyebrow}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <h1 className="page-title">{title}</h1>
        {children}
      </div>
    </header>
  );
}
