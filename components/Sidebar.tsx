import React, { useRef, useMemo, useState } from 'react';
import { Video } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { User } from '@supabase/supabase-js';
import { authService } from '../services/authService';
import { exportService } from '../services/exportService';

interface SidebarProps {
  videos: Video[];
  selectedVideoId: string | null;
  onSelectVideo: (id: string) => void;
  onImportFiles: (files: FileList) => void;
  onImportFolderSelection: (files: FileList) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  onDeleteFolder: (folderPath: string) => void;
  isMobile?: boolean;
  onOpenAuth?: () => void;
  onOpenAccount?: () => void;
  currentUser?: User | null;
}

const VideoItem: React.FC<{ video: Video; selectedVideoId: string | null; onSelectVideo: (id: string) => void; isCollapsed: boolean; }> = ({ video, selectedVideoId, onSelectVideo, isCollapsed }) => {
  const isSelected = selectedVideoId === video.id;
  const baseClasses = `${
    isCollapsed ? 'justify-center px-0 py-2.5 h-11' : 'px-3 py-2.5 gap-3'
  } group/button relative flex w-full items-center rounded-xl border text-[13px] font-medium tracking-tight transition-all duration-200 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6DAE0]`;
  const stateClasses = isSelected
    ? 'bg-white text-slate-900 border-[#E5E7EB] shadow-[0_12px_24px_rgba(15,23,42,0.12)]'
    : 'border-transparent text-slate-600 hover:bg-white/80 hover:border-[#E2E5EB] hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]';

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => onSelectVideo(video.id)}
        className={`${baseClasses} ${stateClasses}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-[22px] w-[22px] flex-shrink-0 ${isSelected ? 'text-slate-800' : 'text-slate-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" />
        </svg>
        {!isCollapsed && (
          <span className="truncate text-[13px] leading-5 text-slate-700">{video.name}</span>
        )}
      </button>
      {isCollapsed && (
        <div className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 rounded-lg bg-slate-900/90 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-200 group-hover/button:opacity-100">
          {video.name}
        </div>
      )}
    </li>
  );
};


const Sidebar: React.FC<SidebarProps> = ({
  videos,
  selectedVideoId,
  onSelectVideo,
  onImportFiles,
  onImportFolderSelection,
  isCollapsed,
  onToggle,
  onOpenSettings,
  onDeleteFolder,
  isMobile = false,
  onOpenAuth,
  onOpenAccount,
  currentUser: propCurrentUser,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const { t } = useLanguage();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (includeVideos: boolean) => {
    setExporting(true);
    setShowExportMenu(false);
    try {
      await exportService.exportAllDataAndDownload(includeVideos);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onImportFiles(event.target.files);
      event.target.value = '';
    }
  };
  const handleImportClick = () => fileInputRef.current?.click();

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onImportFolderSelection(event.target.files);
      event.target.value = '';
    }
  };
  const handleImportFolderClick = () => folderInputRef.current?.click();

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderPath]: !(prev[folderPath] ?? true) }));
  };

  const groupedVideos = useMemo(() => {
    const groups: Record<string, Video[]> = { '__root__': [] };
    videos.forEach(video => {
      const key = video.folderPath || '__root__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(video);
    });
    if (groups['__root__'].length === 0) delete groups['__root__'];
    return groups;
  }, [videos]);

  const sortedFolderKeys = useMemo(() => {
    return Object.keys(groupedVideos).sort((a, b) => {
      if (a === '__root__') return 1;
      if (b === '__root__') return -1;
      return a.localeCompare(b);
    });
  }, [groupedVideos]);

  const sidebarWidthClass = isCollapsed ? 'w-16' : 'w-64';

  const buttonBaseClasses = `${
    isCollapsed ? 'justify-center h-11 px-0' : 'justify-start gap-3 px-3 py-2.5'
  } group relative flex w-full items-center rounded-xl border border-transparent text-[13px] font-medium text-slate-600 transition-all duration-200 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6DAE0]`;
  const hoverAccentClasses = 'hover:bg-white/80 hover:border-[#E2E5EB] hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]';
  const controlButtonClasses = `${buttonBaseClasses} ${hoverAccentClasses}`;

  const renderTooltip = (label: string) =>
    isCollapsed ? (
      <div className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 rounded-lg bg-slate-900/90 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
        {label}
      </div>
    ) : null;

  return (
    <div className={`${sidebarWidthClass} h-full transition-all duration-300 ease-in-out`}>
      <div className="flex h-full flex-col rounded-[28px] border border-[#E5E7EB] bg-[#FCFCFD]/95 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div
          className={`flex items-center border-b border-[#E5E7EB]/70 ${
            isCollapsed ? 'justify-center px-0 py-4' : 'justify-between px-5 py-5'
          }`}
        >
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-800 transition-opacity duration-200">
            {isCollapsed ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-[26px] w-[26px] text-slate-700"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-[24px] w-[24px] text-slate-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                  <rect x="2" y="6" width="14" height="12" rx="2" />
                </svg>
                <span className="text-base font-semibold tracking-tight">{t('appName')}</span>
              </>
            )}
          </h1>
          {isMobile && !isCollapsed && (
            <button
              type="button"
              onClick={onToggle}
              className="-mr-1 rounded-full p-2 text-slate-500 hover:bg-white/60"
              aria-label="Close menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-hidden px-3 pb-5 pt-4">
          <div className={`flex h-full flex-col ${isCollapsed ? 'gap-4' : 'gap-6'}`}>
            <div
              className={`${
                isCollapsed
                  ? 'flex-1'
                  : 'flex-1 rounded-[22px] border border-[#E5E7EB]/80 bg-white/80 shadow-[0_6px_20px_rgba(15,23,42,0.04)]'
              } overflow-hidden`}
            >
              <div className={`${isCollapsed ? 'px-1 py-2' : 'px-3 py-3'} flex h-full flex-col`}>
                {!isCollapsed && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t('myLibrary')}</p>
                )}
                <nav
                  className={`flex-1 overflow-y-auto overflow-x-visible custom-scrollbar pr-1 ${
                    isCollapsed ? 'pt-1' : 'mt-3'
                  }`}
                >
                  <ul className="space-y-2">
                    {sortedFolderKeys.map((folderKey) => {
                      const folderVideos = groupedVideos[folderKey];
                      if (folderKey === '__root__') {
                        return folderVideos.map((video) => (
                          <VideoItem key={video.id} {...{ video, selectedVideoId, onSelectVideo, isCollapsed }} />
                        ));
                      }

                      const isExpanded = expandedFolders[folderKey] ?? true;
                      return (
                        <li key={folderKey} className="relative">
                          <button
                            type="button"
                            onClick={() => toggleFolder(folderKey)}
                            className={`${
                              isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5 gap-3'
                            } group relative flex w-full items-center rounded-xl border border-transparent text-[13px] font-semibold text-slate-600 transition-all duration-200 backdrop-blur-md hover:bg-white/80 hover:border-[#E2E5EB] hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6DAE0]`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-[22px] w-[22px] flex-shrink-0 text-slate-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={1.8}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                              />
                            </svg>
                            {!isCollapsed && <span className="truncate text-left text-[13px] font-medium">{folderKey}</span>}
                          </button>
                          {renderTooltip(folderKey)}
                          {isExpanded && !isCollapsed && (
                            <ul className="mt-2 space-y-2 pl-3">
                              {folderVideos.map((video) => (
                                <VideoItem
                                  key={video.id}
                                  {...{ video, selectedVideoId, onSelectVideo, isCollapsed }}
                                />
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
            </div>

            <div
              className={`${
                isCollapsed
                  ? 'space-y-3'
                  : 'rounded-[22px] border border-[#E5E7EB]/80 bg-white/80 p-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)]'
              }`}
            >
              <div className={`${isCollapsed ? 'space-y-3' : 'space-y-4'}`}>
                {!isCollapsed && (
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {t('tools')}
                  </p>
                )}

                {authService.isAvailable() && (
                  <div>
                    {propCurrentUser ? (
                      <button
                        type="button"
                        onClick={() => onOpenAccount?.()}
                        className={`${controlButtonClasses} bg-white/70 text-slate-700`}
                        aria-label={t('account')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-[22px] w-[22px] flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {!isCollapsed && !isMobile && (
                          <span className="truncate text-[13px] font-medium">
                            {propCurrentUser.email?.split('@')[0]}
                          </span>
                        )}
                        {renderTooltip(propCurrentUser.email || '')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenAuth?.()}
                        className={`${controlButtonClasses} bg-[#E6ECFF]/80 text-[#1b3abb] hover:bg-[#dce3ff]`}
                        aria-label={t('signIn')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-[22px] w-[22px] flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                          />
                        </svg>
                        {!isCollapsed && !isMobile && (
                          <span className="text-[13px] font-medium">{t('signIn')}</span>
                        )}
                        {renderTooltip(t('signIn'))}
                      </button>
                    )}
                  </div>
                )}

                <div
                  className={`${
                    isCollapsed
                      ? 'flex flex-col gap-2'
                      : 'grid grid-cols-1 gap-2 sm:grid-cols-2'
                  }`}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (isCollapsed) {
                          handleExport(false);
                        } else {
                          setShowExportMenu((prev) => !prev);
                        }
                      }}
                      disabled={exporting}
                      className={`${controlButtonClasses} ${
                        exporting ? 'cursor-not-allowed opacity-50' : ''
                      }`}
                      aria-label={t('export')}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-[22px] w-[22px] flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                        />
                      </svg>
                      {!isCollapsed && !isMobile && (
                        <span className="text-[13px] font-medium">
                          {exporting ? t('exporting') : t('export')}
                        </span>
                      )}
                      {renderTooltip(t('exportDataOnly'))}
                    </button>

                    {showExportMenu && !isCollapsed && (
                      <div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-[#E5E7EB] bg-white/95 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                        <button
                          type="button"
                          onClick={() => handleExport(false)}
                          className="w-full rounded-xl px-3 py-2 text-left text-[13px] text-slate-600 transition hover:bg-slate-100"
                        >
                          {t('exportDataOnly')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExport(true)}
                          className="w-full rounded-xl px-3 py-2 text-left text-[13px] text-slate-600 transition hover:bg-slate-100"
                        >
                          {t('exportAll')}
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleImportClick}
                    className={controlButtonClasses}
                    aria-label={t('importFile')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-[22px] w-[22px] flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                      />
                    </svg>
                    {!isCollapsed && !isMobile && (
                      <span className="text-[13px] font-medium">{t('importFile')}</span>
                    )}
                    {renderTooltip(t('importFile'))}
                  </button>

                  <button
                    type="button"
                    onClick={handleImportFolderClick}
                    className={controlButtonClasses}
                    aria-label={t('importFolder')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-[22px] w-[22px] flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 9.75h16.5m-16.5 0A2.25 2.25 0 0 1 5.25 7.5h13.5a2.25 2.25 0 0 1 2.25 2.25m-16.5 0v1.5A2.25 2.25 0 0 0 5.25 13.5h13.5a2.25 2.25 0 0 0 2.25-2.25v-1.5m-16.5 0a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25h16.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75Z"
                      />
                    </svg>
                    {!isCollapsed && !isMobile && (
                      <span className="text-[13px] font-medium">{t('importFolder')}</span>
                    )}
                    {renderTooltip(t('importFolder'))}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`px-3 pb-4 ${isCollapsed ? 'pt-2' : 'border-t border-[#E5E7EB]/70 pt-4'}`}>
          <div className={`${isCollapsed ? 'flex flex-col gap-2' : 'flex flex-col gap-3'}`}>
            <button
              type="button"
              onClick={onOpenSettings}
              className={controlButtonClasses}
              aria-label={t('settings')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-[22px] w-[22px] flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {!isCollapsed && <span className="text-[13px] font-medium">{t('settings')}</span>}
              {renderTooltip(t('settings'))}
            </button>

            {!isMobile && (
              <button
                type="button"
                onClick={onToggle}
                className={controlButtonClasses}
                aria-label={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
              >
                {isCollapsed ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-[22px] w-[22px] flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-[22px] w-[22px] flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
                  </svg>
                )}
                {!isCollapsed && <span className="text-[13px] font-medium">{t('collapseSidebar')}</span>}
                {renderTooltip(isCollapsed ? t('expandSidebar') : t('collapseSidebar'))}
              </button>
            )}
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
    </div>
  );
};

export default Sidebar;