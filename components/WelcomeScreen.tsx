import React, { useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { useLanguage } from '../contexts/LanguageContext';

interface WelcomeScreenProps {
  onImportFiles: (files: FileList) => void;
  onImportFolderSelection: (files: FileList) => void;
  onLogin: () => void;
  onRegister: () => void;
  onOpenAccount?: () => void;
  currentUser?: User | null;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onImportFiles,
  onImportFolderSelection,
  onLogin,
  onRegister,
  onOpenAccount,
  currentUser,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { t } = useLanguage();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onImportFiles(event.target.files);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onImportFolderSelection(event.target.files);
      event.target.value = '';
    }
  };

  const handleImportFolderClick = () => {
    folderInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-[#f7f9fc]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(148,163,255,0.24),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(94,234,212,0.18),transparent_50%),linear-gradient(125deg,rgba(255,255,255,0.92),rgba(244,247,252,0.85))]" />
        <div
          className="absolute inset-0 mix-blend-overlay opacity-50"
          style={{
            backgroundImage:
              'linear-gradient(115deg, rgba(180, 193, 255, 0.08) 0%, rgba(180, 193, 255, 0) 55%), linear-gradient(25deg, rgba(94, 234, 212, 0.08) 0%, rgba(94, 234, 212, 0) 55%)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(148,163,255,0.08)_35%,transparent_70%)]" />
      </div>

      <div className="relative z-10 flex flex-col min-h-full items-center px-6 sm:px-8 lg:px-14 py-12">
        <header className="w-full max-w-6xl mx-auto flex items-center justify-between gap-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl border border-white/70 bg-white/90 shadow-[0_12px_35px_rgba(85,100,246,0.15)] backdrop-blur flex items-center justify-center">
              <span className="text-lg font-semibold text-[#4c5cf2] tracking-[0.3em]">IS</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-slate-400">InsightSeel</p>
              <h1 className="text-2xl font-semibold text-slate-900">AI Video Parsing Intelligence</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentUser ? (
              <button
                onClick={() => onOpenAccount?.()}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm font-medium text-slate-600 bg-white/80 backdrop-blur-lg hover:bg-white shadow-sm transition"
              >
                {currentUser.email || 'Account'}
              </button>
            ) : (
              <>
                <button
                  onClick={onLogin}
                  className="px-4 py-2 rounded-full text-sm font-medium text-slate-600 border border-slate-200 bg-white/70 hover:bg-white shadow-sm transition"
                >
                  登录
                </button>
                <button
                  onClick={onRegister}
                  className="px-5 py-2 rounded-full text-sm font-semibold text-white bg-[linear-gradient(135deg,#4b5cf2,#6f8bff)] hover:shadow-[0_15px_35px_rgba(75,92,242,0.35)] transition"
                >
                  注册
                </button>
              </>
            )}
          </div>
        </header>

        <div className="w-full max-w-5xl mx-auto flex flex-col items-center pb-16 text-slate-900">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 border border-white/70 text-xs uppercase tracking-[0.32em] text-slate-500 shadow-[0_12px_28px_rgba(148,163,255,0.18)]">
            ⚡ {t('welcomeBoxTitle')}
          </div>
          <h2 className="mt-6 text-center text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-slate-900 leading-tight max-w-4xl">
            {t('welcomeTitle')}
          </h2>
          <p className="mt-5 text-lg md:text-xl text-slate-600 max-w-3xl leading-relaxed text-center">
            {t('welcomeSubtitle')}
          </p>

          <div
            className={`relative mt-12 w-full max-w-3xl group transition-all duration-500 ${isDragging ? 'scale-[1.01]' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div
              className={`absolute inset-0 rounded-[30px] bg-[conic-gradient(from_120deg_at_50%_50%,rgba(91,118,255,0.28),rgba(91,118,255,0)_70%)] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100 ${
                isDragging ? 'opacity-100' : ''
              }`}
              aria-hidden
            />
            <div
              className={`relative rounded-[28px] border border-slate-200/80 bg-white/90 backdrop-blur-2xl p-10 md:p-12 shadow-[0_32px_70px_rgba(79,106,255,0.14)] transition-all duration-300 ${
                isDragging
                  ? 'border-[#4c5cf2]/60 shadow-[0_32px_80px_rgba(79,106,255,0.22)]'
                  : 'hover:border-[#4c5cf2]/50 hover:shadow-[0_32px_80px_rgba(79,106,255,0.18)]'
              }`}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#eef2ff] via-white to-[#e0f7f4] text-[#4c5cf2] transition-transform duration-300 shadow-[0_18px_35px_rgba(76,92,242,0.22)] ${
                    isDragging ? 'scale-110 shadow-[0_0_35px_rgba(76,92,242,0.35)]' : 'group-hover:scale-110'
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[#4c5cf2]"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-slate-900 tracking-wide">
                  {t('dropTarget')}
                </h3>
                <p className="mt-3 text-sm text-slate-500 max-w-sm">
                  {t('dropTargetHint')}
                </p>
                <div className="mt-10 flex flex-col sm:flex-row gap-3 w-full sm:w-auto justify-center">
                  <button
                    onClick={handleImportClick}
                    className="w-full sm:w-auto px-8 py-3 rounded-full bg-[linear-gradient(135deg,#4b5cf2,#7b9cff)] text-white font-semibold shadow-[0_18px_35px_rgba(75,92,242,0.32)] hover:brightness-110 transition"
                  >
                    {t('browseFile')}
                  </button>
                  <button
                    onClick={handleImportFolderClick}
                    className="w-full sm:w-auto px-8 py-3 rounded-full border border-slate-200/80 text-slate-600 font-medium bg-white/70 backdrop-blur-xl hover:bg-white transition"
                  >
                    {t('importFolder')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="video/mp4,video/webm,video/ogg,video/quicktime,.srt,.vtt"
            multiple
          />
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderChange}
            className="hidden"
            // @ts-ignore
            webkitdirectory=""
            multiple
          />

          <div className="relative mt-16 w-full">
            <div className="absolute inset-x-0 -bottom-20 flex justify-center" aria-hidden>
              <div className="h-56 w-[90%] max-w-4xl rounded-full bg-[radial-gradient(circle_at_center,rgba(148,163,255,0.28),transparent_70%)] blur-3xl opacity-80" />
            </div>
            <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/60 backdrop-blur-3xl shadow-[0_32px_70px_rgba(79,106,255,0.12)]">
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(91,118,255,0.22),transparent_60%),linear-gradient(135deg,rgba(148,163,255,0.12),rgba(94,234,212,0.08))] opacity-70"
                aria-hidden
              />
              <div className="relative grid divide-y divide-white/40 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
                <div className="p-8">
                  <p className="text-xs uppercase tracking-[0.36em] text-slate-500">多引擎</p>
                  <p className="mt-4 text-sm text-slate-600 leading-relaxed">
                    智能路由驱动的字幕、分析与翻译能力
                  </p>
                </div>
                <div className="p-8">
                  <p className="text-xs uppercase tracking-[0.36em] text-slate-500">批量</p>
                  <p className="mt-4 text-sm text-slate-600 leading-relaxed">文件夹导入、多任务并发与进度可视化</p>
                </div>
                <div className="p-8">
                  <p className="text-xs uppercase tracking-[0.36em] text-slate-500">云同步</p>
                  <p className="mt-4 text-sm text-slate-600 leading-relaxed">自动同步字幕、分析与聊天记录至云端</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
