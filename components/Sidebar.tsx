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
  const commonClasses = "flex items-center w-full p-2 rounded-xl transition-colors text-slate-700";
  const selectedClasses = "bg-slate-200/60 font-medium";
  const hoverClasses = "hover:bg-slate-200/40";

  return (
    <li className="relative group">
      <button
        onClick={() => onSelectVideo(video.id)}
        className={`${commonClasses} ${isSelected ? selectedClasses : hoverClasses} ${isCollapsed ? 'justify-center' : ''}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 flex-shrink-0 ${isSelected ? 'text-slate-800' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" />
        </svg>
        {!isCollapsed && (
          <span className="ml-3 text-sm truncate">{video.name}</span>
        )}
      </button>
      {isCollapsed && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg pointer-events-none">
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

  const baseControlButtonClasses =
    'relative group flex w-full items-center rounded-xl text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60';
  const controlButtonClasses = `${baseControlButtonClasses} ${
    isCollapsed
      ? 'justify-center h-10 p-2.5 hover:bg-slate-200/50'
      : 'justify-start gap-3 px-3 py-2.5 hover:bg-slate-200/60'
  }`;

  return (
    <div className={`h-full flex flex-col backdrop-blur-sm bg-white/90 border border-slate-200/40 transition-all duration-300 ease-in-out ${sidebarWidthClass} rounded-2xl shadow-sm`}>
      {/* Header */}
      <div className={`p-4 h-[48px] border-b border-slate-200/40 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <h1 className="text-xl font-bold text-slate-800 transition-opacity duration-200 flex items-center gap-2">
          {isCollapsed ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
              <rect x="2" y="6" width="14" height="12" rx="2"/>
            </svg>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
                <rect x="2" y="6" width="14" height="12" rx="2"/>
              </svg>
              <span>{t('appName')}</span>
            </>
          )}
        </h1>
        {isMobile && !isCollapsed && (
          <button onClick={onToggle} className="p-2 -mr-2 rounded-full text-slate-600 hover:bg-white/40" aria-label="Close menu">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Video List */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto overflow-x-visible custom-scrollbar">
        {!isCollapsed && (
           <p className="px-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t('myLibrary')}
            </p>
        )}
        <ul className="space-y-1">
          {sortedFolderKeys.map(folderKey => {
            const folderVideos = groupedVideos[folderKey];
            if (folderKey === '__root__') {
              return folderVideos.map(video => (
                <VideoItem key={video.id} {...{ video, selectedVideoId, onSelectVideo, isCollapsed }} />
              ));
            }

            const isExpanded = expandedFolders[folderKey] ?? true;
            return (
              <li key={folderKey} className="relative group/folder">
                <button
                  onClick={() => toggleFolder(folderKey)}
                  className={`flex items-center w-full p-2 rounded-xl transition-colors text-slate-700 hover:bg-slate-200/40 ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                  {!isCollapsed && <span className="truncate ml-3 flex-1 text-left text-sm font-medium">{folderKey}</span>}
                </button>
                {isCollapsed && (
                   <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover/folder:visible group-hover/folder:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                      {folderKey}
                    </div>
                )}
                {isExpanded && !isCollapsed && (
                  <ul className="pl-4 mt-1 space-y-1">
                    {folderVideos.map(video => (
                      <VideoItem key={video.id} {...{ video, selectedVideoId, onSelectVideo, isCollapsed }} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer Controls */}
      <div className="p-3 border-t border-slate-200/50 space-y-2">
        {/* Account / Auth Button */}
        {authService.isAvailable() && (
          <div className="mb-2">
            {propCurrentUser ? (
              <button
                onClick={() => onOpenAccount?.()}
                className={`${controlButtonClasses} bg-slate-100/50`}
                aria-label={t('account')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {!isCollapsed && !isMobile && <span className="text-xs font-medium truncate">{propCurrentUser.email?.split('@')[0]}</span>}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                    {propCurrentUser.email}
                  </div>
                )}
              </button>
            ) : (
              <button
                onClick={() => onOpenAuth?.()}
                className={`${controlButtonClasses} bg-blue-50/50 text-blue-600 hover:bg-blue-100/50`}
                aria-label={t('signIn')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                {!isCollapsed && !isMobile && <span className="text-xs font-medium">{t('signIn')}</span>}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                    {t('signIn')}
                  </div>
                )}
              </button>
            )}
          </div>
        )}

        {/* Export Button with Menu */}
        <div className="mb-2 relative">
          <button
            onClick={() => {
              if (isCollapsed) {
                handleExport(false);
              } else {
                setShowExportMenu(!showExportMenu);
              }
            }}
            disabled={exporting}
            className={`${controlButtonClasses} ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={t('export')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            {!isCollapsed && !isMobile && <span className="text-xs font-medium">{exporting ? t('exporting') : t('export')}</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                {t('exportDataOnly')}
              </div>
            )}
          </button>

          {showExportMenu && !isCollapsed && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg p-2 space-y-1 z-50">
              <button
                onClick={() => handleExport(false)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded transition-colors"
              >
                {t('exportDataOnly')}
              </button>
              <button
                onClick={() => handleExport(true)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded transition-colors"
              >
                {t('exportAll')}
              </button>
            </div>
          )}
        </div>

        {/* All Other Buttons */}
        <div className={`grid gap-2 ${isCollapsed ? 'grid-cols-1' : isMobile ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button onClick={handleImportClick} className={controlButtonClasses} aria-label={t('importFile')}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
            </svg>
            {!isCollapsed && !isMobile && <span className="text-xs font-medium">{t('importFile')}</span>}
            {isCollapsed && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                {t('importFile')}
              </div>
            )}
          </button>
          <button onClick={handleImportFolderClick} className={controlButtonClasses} aria-label={t('importFolder')}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75h16.5m-16.5 0A2.25 2.25 0 0 1 5.25 7.5h13.5a2.25 2.25 0 0 1 2.25 2.25m-16.5 0v1.5A2.25 2.25 0 0 0 5.25 13.5h13.5a2.25 2.25 0 0 0 2.25-2.25v-1.5m-16.5 0a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25h16.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75Z" />
            </svg>
            {!isCollapsed && !isMobile && <span className="text-xs font-medium">{t('importFolder')}</span>}
            {isCollapsed && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                {t('importFolder')}
              </div>
            )}
          </button>
          <button onClick={onOpenSettings} className={controlButtonClasses} aria-label={t('settings')}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!isCollapsed && !isMobile && <span className="text-xs font-medium">{t('settings')}</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                {t('settings')}
              </div>
            )}
          </button>
          {!isMobile && (
            <button
              onClick={onToggle}
              className={controlButtonClasses}
              aria-label={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
            >
              {isCollapsed ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
                </svg>
              )}
              {!isCollapsed && <span className="text-xs font-medium">{t('collapseSidebar')}</span>}
              {isCollapsed && (
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
                  {t('expandSidebar')}
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
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