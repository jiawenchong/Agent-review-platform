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
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: '"Microsoft YaHei", "微軟正黑體", "Noto Sans TC", sans-serif',
        themeVariables: {
          background: '#000000',
          mainBkg: '#1a1a1a',
          primaryColor: '#1e1e1e',
          primaryBorderColor: '#cccccc',
          primaryTextColor: '#ffffff',
          secondaryColor: '#111111',
          tertiaryColor: '#1a1a1a',
          lineColor: '#888888',
          edgeLabelBackground: '#1a1a1a',
          clusterBkg: '#0d0d0d',
          clusterBorder: '#d4a017',   // gold border — matches PPT yellow subgraph frames
          titleColor: '#d4a017',
          fontSize: '13px',
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let exportIdCounter = 0;

// Shared by the inline <Mermaid> component and the PPT export button — both
// need the same bold-Microsoft-YaHei-on-black rendering of a chart string.
export async function renderMermaidSvg(chart: string): Promise<string> {
  const mermaid = await loadMermaid();
  const { svg } = await mermaid.render(`mmd-export-${exportIdCounter++}`, chart);
  return svg.replace(/<text(\s)/g, '<text font-weight="700"$1');
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
        if (ref.current) {
          // Inject font-weight="700" into every SVG <text> element so
          // Microsoft YaHei renders bold, matching the user's PPT reference.
          const boldSvg = svg.replace(/<text(\s)/g, '<text font-weight="700"$1');
          ref.current.innerHTML = boldSvg;
        }
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
          background: '#111', borderRadius: 10, padding: '12px 14px', color: '#ff6b6b',
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
