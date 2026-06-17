import { useEffect, useId, useRef, useState } from 'react';
import type { Mermaid as MermaidApi } from 'mermaid';

// Lazy-loaded + memoised so the (large) mermaid bundle is only fetched the
// first time a flowchart is actually rendered, and initialised just once.
let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
        themeVariables: {
          primaryColor: '#e6efeb',
          primaryBorderColor: '#1f4d3c',
          primaryTextColor: '#2b2620',
          lineColor: '#936639',
          fontSize: '13px',
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render(`mmd-${id}`, chart))
      .then(({ svg }) => {
        if (cancelled) return;
        if (ref.current) ref.current.innerHTML = svg;
        setError('');
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '流程圖渲染失敗');
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <pre
        style={{
          whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 12,
          background: 'var(--surface-alt)', borderRadius: 10, padding: '12px 14px', color: 'var(--red-text)',
        }}
      >
        {error}
        {'\n\n'}
        {chart}
      </pre>
    );
  }

  return <div ref={ref} style={{ overflowX: 'auto', textAlign: 'center' }} />;
}
