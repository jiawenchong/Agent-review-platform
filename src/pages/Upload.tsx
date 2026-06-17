import { useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';

type UploadState = 'idle' | 'parsing' | 'done' | 'failed';

export function Upload() {
  const [state, setState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.name.endsWith('.docx')) {
      setError('檔案格式不支援，請上傳 .docx 格式的文件。');
      setState('failed');
      return;
    }
    setFileName(file.name);
    setError('');
    setState('parsing');
    setTimeout(() => {
      if (file.size === 0) {
        setError('文件解析失敗，請確認檔案內容完整後重新上傳。');
        setState('failed');
      } else {
        setState('done');
      }
    }, 2200);
  };

  const handleFiles = (files: FileList | null) => {
    if (files && files[0]) processFile(files[0]);
  };

  const reset = () => {
    setState('idle');
    setFileName('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 01" title="上傳資料" />
      <div className="page-body">
        <div
          className="upload-dropzone"
          onClick={() => state !== 'parsing' && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (state !== 'parsing') handleFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {state === 'idle' && (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-heading)', marginBottom: 6 }}>
                拖放或點擊上傳 .docx 文件
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>支援 Word 文件格式，系統將自動解析專案進度資料</div>
            </>
          )}

          {state === 'parsing' && (
            <>
              <div
                style={{
                  width: 32, height: 32, margin: '0 auto 14px',
                  border: '3px solid var(--border-subtle)', borderTopColor: 'var(--text-mid)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }}
              />
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-heading)', marginBottom: 6 }}>
                正在解析 {fileName}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>請稍候，系統正在擷取文件內容</div>
            </>
          )}

          {state === 'done' && (
            <>
              <div style={{ fontSize: 32, marginBottom: 12, color: 'var(--green-text)' }}>✓</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-heading)', marginBottom: 6 }}>
                {fileName} 解析完成
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>資料已成功匯入，可至專案儀表板查看</div>
            </>
          )}

          {state === 'failed' && (
            <>
              <div style={{ fontSize: 32, marginBottom: 12, color: 'var(--red-text)' }}>✕</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-heading)', marginBottom: 6 }}>
                上傳失敗
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--red-text)' }}>{error}</div>
            </>
          )}
        </div>

        {(state === 'done' || state === 'failed') && (
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); reset(); }}>
              重新上傳
            </button>
          </div>
        )}
      </div>
    </>
  );
}
