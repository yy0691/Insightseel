import React, { useState, useRef, useEffect } from 'react';
import { BaseModal } from './ui/BaseModal';

interface YouTubeImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (url: string) => void;
  language: string;
}

const YouTubeImportModal: React.FC<YouTubeImportModalProps> = ({
  open,
  onOpenChange,
  onImport,
  language,
}) => {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onImport(trimmed);
    onOpenChange(false);
  };

  const isZh = language === 'zh';

  return (
    <BaseModal open={open} onOpenChange={onOpenChange} size="sm">
      <BaseModal.Header
        title={isZh ? '导入 YouTube 视频' : 'Import YouTube Video'}
        subtitle={isZh ? '粘贴 YouTube 视频链接以导入字幕' : 'Paste a YouTube link to import its captions'}
      />
      <BaseModal.Body>
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        />
      </BaseModal.Body>
      <BaseModal.Footer>
        <button
          onClick={() => onOpenChange(false)}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
        >
          {isZh ? '取消' : 'Cancel'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!url.trim()}
          className="px-5 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isZh ? '导入' : 'Import'}
        </button>
      </BaseModal.Footer>
    </BaseModal>
  );
};

export default YouTubeImportModal;
