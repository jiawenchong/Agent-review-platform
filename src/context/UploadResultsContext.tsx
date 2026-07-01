import { createContext, useContext, useState, type ReactNode } from 'react';
import type { UploadedDocument } from '../api/client';

interface UploadResultsContextValue {
  results: UploadedDocument[];
  addResults: (docs: UploadedDocument[]) => void;
  clearResults: () => void;
}

const UploadResultsContext = createContext<UploadResultsContextValue | null>(null);

// Lives above <Routes> (see App.tsx) so switching pages and back doesn't lose
// the parsed upload results — only the explicit "清除結果" button does.
export function UploadResultsProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<UploadedDocument[]>([]);

  const addResults = (docs: UploadedDocument[]) => {
    setResults((prev) => [...docs, ...prev]);
  };
  const clearResults = () => setResults([]);

  return (
    <UploadResultsContext.Provider value={{ results, addResults, clearResults }}>
      {children}
    </UploadResultsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUploadResults() {
  const ctx = useContext(UploadResultsContext);
  if (!ctx) throw new Error('useUploadResults must be used within UploadResultsProvider');
  return ctx;
}
