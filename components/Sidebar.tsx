import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Video } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { User } from '@supabase/supabase-js';
import { authService } from '../services/authService';
import { exportService } from '../services/exportService';
import { 
  FolderInput, 
  Video as VideoIcon, 
  X, 
  Search, 
  ArrowUpDown, 
  ChevronDown, 
  Folder, 
  User as UserIcon, 
  LogIn, 
  Download, 
  Settings, 
  Menu, 
  PanelLeft,
  PanelLeftOpen,
  Trash2,
  GripVertical
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SidebarProps {
  videos: Video[];
  selectedVideoId: string | null;
  onSelectVideo: (id: string | null) => void;
  onImportFiles: (files: FileList) => void;
  onImportFolderSelection: (files: FileList) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  onDeleteFolder: (folderPath: string) => void;
  onDeleteVideo?: (id: string) => void;
  onReorderVideos?: (videos: Video[]) => void;
  isMobile?: boolean;
  onOpenAuth?: () => void;
  onOpenAccount?: () => void;
  currentUser?: User | null;
}

type VideoItemProps = {
  video: Video;
  selectedVideoId: string | null;
  onSelectVideo: (id: string | null) => void;
  isCollapsed: boolean;
  onDeleteVideo?: (id: string) => void;
};

type FolderItemProps = {
  folderKey: string;
  folderVideos: Video[];
  isExpanded: boolean;
  isCollapsed: boolean;
  isMobile: boolean;
  selectedVideoId: string | null;
  onSelectVideo: (id: string | null) => void;
  onToggleFolder: (folderPath: string, e?: React.MouseEvent) => void;
  onDeleteVideo?: (id: string) => void;
};

const VideoItem: React.FC<VideoItemProps> = ({
  video,
  selectedVideoId,
  onSelectVideo,
  isCollapsed,
  onDeleteVideo,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSelected = selectedVideoId === video.id;
  const baseClasses = `flex items-center text-[13px] transition-colors ${isCollapsed ? 'justify-center p-2' : 'px-3 py-2 pr-8'}`;
  const shapeClasses = isSelected ? 'rounded-full' : (isCollapsed ? 'rounded-full' : 'rounded-xl');
  const commonClasses = `${baseClasses} ${shapeClasses}`;
  const selectedClasses = "bg-slate-900 text-slate-50 shadow-sm";
  const hoverClasses = "text-slate-700 hover:bg-slate-100/80";

  return (
    <li className={`relative group ${isCollapsed ? 'flex items-center justify-center' : ''}`} ref={setNodeRef} style={style}>
      <button
        onClick={() => onSelectVideo(video.id)}
        className={`${commonClasses} ${isSelected ? selectedClasses : hoverClasses} ${isCollapsed ? 'w-auto' : 'w-full'}`}
      >
        {/* Drag handle - only visible when not collapsed */}
        {!isCollapsed && (
          <div {...attributes} {...listeners} className="mr-1 cursor-grab active:cursor-grabbing">
            <GripVertical className="h-3.5 w-3.5 text-slate-400" />
          </div>
        )}
        <VideoIcon className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-slate-50' : 'text-slate-500'}`} />
        {!isCollapsed && (
          <span className={`ml-2.5 truncate ${isSelected ? 'text-slate-50' : 'text-slate-700'}`}>{video.name}</span>
        )}
      </button>
      {/* Delete button: only when not collapsed and onDeleteVideo is provided */}
      {!isCollapsed && onDeleteVideo && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-xl hover:bg-slate-200"
          title="Delete"
          onClick={e => {
            e.stopPropagation();
            onDeleteVideo(video.id);
          }}
          tabIndex={-1}
        >
          <Trash2 className="h-3.5 w-3.5 text-slate-400" />
        </button>
      )}
      {isCollapsed && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-2xl whitespace-nowrap z-50 shadow-lg pointer-events-none">
          {video.name}
        </div>
      )}
    </li>
  );
};

const FolderItem: React.FC<FolderItemProps> = ({
  folderKey,
  folderVideos,
  isExpanded,
  isCollapsed,
  isMobile,
  selectedVideoId,
  onSelectVideo,
  onToggleFolder,
  onDeleteVideo,
}) => {
  const [showHoverMenu, setShowHoverMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const hoverMenuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <li className="relative group/folder">
      <button
        ref={buttonRef}
        onClick={(e) => onToggleFolder(folderKey, e)}
        onMouseEnter={() => {
          if (isCollapsed && !isMobile && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const menuWidth = 200; // 菜单最小宽度
            const spacing = 8; // 间距
            
            // 计算菜单位置，确保不超出视口
            let left = rect.right + spacing;
            // 如果菜单会超出右边界，则显示在按钮左侧
            if (left + menuWidth > window.innerWidth) {
              left = rect.left - menuWidth - spacing;
            }
            
            setMenuPosition({
              top: Math.max(8, rect.top), // 至少距离顶部8px
              left: Math.max(8, left), // 至少距离左侧8px
            });
            setShowHoverMenu(true);
          }
        }}
        onMouseLeave={() => {
          if (isCollapsed && !isMobile) {
            // 延迟隐藏，以便用户能够移动到弹出菜单
            setTimeout(() => {
              if (!hoverMenuRef.current?.matches(':hover')) {
                setShowHoverMenu(false);
              }
            }, 100);
          }
        }}
        className={`flex items-center w-full rounded-xl bg-slate-50 transition-colors text-slate-700 hover:bg-slate-100/80 ${isCollapsed ? 'justify-center p-2' : 'px-3 py-2'}`}
      >
        <Folder className="w-4 h-4 text-slate-500 flex-shrink-0" />
        {!isCollapsed && <span className="truncate ml-2.5 flex-1 text-left text-[13px] font-medium">{folderKey}</span>}
      </button>
      {isCollapsed && !showHoverMenu && (
         <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 invisible opacity-0 group-hover/folder:visible group-hover/folder:opacity-100 transition-opacity duration-200 bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-2xl whitespace-nowrap z-20 shadow-lg pointer-events-none">
            {folderKey} ({folderVideos.length})
          </div>
      )}
      {/* 折叠状态下的悬停菜单 */}
      {isCollapsed && showHoverMenu && !isMobile && (
        <div
          ref={hoverMenuRef}
          onMouseEnter={() => setShowHoverMenu(true)}
          onMouseLeave={() => setShowHoverMenu(false)}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 9999,
          }}
          className="bg-white border border-slate-200/60 rounded-2xl shadow-lg min-w-[200px] max-h-[400px] overflow-y-auto"
        >
          <div className="px-3 py-2 border-b border-slate-200/60 bg-slate-50">
            <div className="flex items-center gap-2">
              <Folder className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-medium text-slate-700 truncate">{folderKey}</span>
              <span className="text-xs text-slate-500">({folderVideos.length})</span>
            </div>
          </div>
          <ul className="py-1">
            {folderVideos.map(video => (
              <li key={video.id}>
                <button
                  onClick={() => {
                    onSelectVideo(video.id);
                    setShowHoverMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                    selectedVideoId === video.id
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <VideoIcon className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                  <span className="truncate">{video.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isExpanded && !isCollapsed && (
        <ul className="pl-5 mt-1 space-y-1.5">
          {folderVideos.map(video => (
            <VideoItem key={video.id} {...{ video, selectedVideoId, onSelectVideo, isCollapsed, onDeleteVideo }} />
          ))}
        </ul>
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
  onDeleteVideo,
  onReorderVideos,
  isMobile = false,
  onOpenAuth,
  onOpenAccount,
  currentUser: propCurrentUser,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const { t } = useLanguage();

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required before drag starts
      },
    })
  );

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<"nameAsc" | "nameDesc" | "dateDesc" | "dateAsc" | "sizeDesc" | "sizeAsc">("nameAsc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Close sort menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setShowImportMenu(false);
      }
    };

    if (showSortMenu || showImportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSortMenu, showImportMenu]);

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
    setShowImportMenu(false);
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onImportFolderSelection(event.target.files);
      event.target.value = '';
    }
    setShowImportMenu(false);
  };

  const handleImportClick = () => {
    setShowImportMenu(!showImportMenu);
  };

  const handleImportFileClick = () => {
    fileInputRef.current?.click();
    setShowImportMenu(false);
  };

  const handleImportFolderClick = () => {
    folderInputRef.current?.click();
    setShowImportMenu(false);
  };

  const toggleFolder = (folderPath: string, e?: React.MouseEvent) => {
    // 如果侧边栏是折叠状态，点击文件夹时先展开侧边栏
    if (isCollapsed && !isMobile) {
      onToggle();
      // 展开该文件夹
      setExpandedFolders(prev => ({ ...prev, [folderPath]: true }));
      e?.stopPropagation();
      return;
    }
    setExpandedFolders(prev => ({ ...prev, [folderPath]: !(prev[folderPath] ?? true) }));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    if (onReorderVideos) {
      const oldIndex = processedVideos.findIndex((video) => video.id === active.id);
      const newIndex = processedVideos.findIndex((video) => video.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedVideos: Video[] = arrayMove(processedVideos, oldIndex, newIndex);
        // Update order field for all videos
        const videosWithOrder = reorderedVideos.map((video, index) => ({
          ...video,
          order: index,
        }));
        onReorderVideos(videosWithOrder);
      }
    }
  };

  const processedVideos = useMemo<Video[]>(() => {
    let result = [...videos];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((video) => {
        const name = video.name?.toLowerCase() ?? "";
        const folder = video.folderPath?.toLowerCase() ?? "";
        return name.includes(q) || folder.includes(q);
      });
    }
    result.sort((a, b) => {
      switch (sortMode) {
        case "nameAsc":
          return a.name.localeCompare(b.name);
        case "nameDesc":
          return b.name.localeCompare(a.name);
        case "dateDesc":
          return new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime();
        case "dateAsc":
          return new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime();
        case "sizeDesc":
          return (b.size || 0) - (a.size || 0);
        case "sizeAsc":
          return (a.size || 0) - (b.size || 0);
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return result;
  }, [videos, searchTerm, sortMode]);

  const groupedVideos = useMemo(() => {
    const groups: Record<string, Video[]> = { '__root__': [] };
    processedVideos.forEach(video => {
      const key = video.folderPath || '__root__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(video);
    });
    if (groups['__root__'].length === 0) delete groups['__root__'];
    return groups;
  }, [processedVideos]);

  const sortedFolderKeys = useMemo(() => {
    return Object.keys(groupedVideos).sort((a, b) => {
      if (a === '__root__') return 1;
      if (b === '__root__') return -1;
      return a.localeCompare(b);
    });
  }, [groupedVideos]);

  const sidebarWidthClass = isCollapsed ? 'w-16' : 'w-64';

  const baseControlButtonClasses =
    'relative group flex items-center text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70';

  const controlButtonCollapsed =
    `${baseControlButtonClasses} justify-center w-full h-9 rounded-xl hover:bg-slate-100`;

  const controlButtonPrimary =
    `${baseControlButtonClasses} justify-center gap-1.5 h-9 px-3 rounded-xl text-[11px] bg-slate-900 text-white hover:bg-slate-800`;

  const controlButtonSecondary =
    `${baseControlButtonClasses} justify-center gap-1.5 h-9 px-3 rounded-xl text-[11px] bg-slate-100 text-slate-900 hover:bg-slate-200`;

  const controlButtonGhost =
    `${baseControlButtonClasses} justify-center gap-1.5 h-9 px-3 rounded-xl text-[11px] text-slate-600 hover:bg-slate-100`;

  return (
    <div className={`h-full flex flex-col transition-all duration-300 ease-in-out ${sidebarWidthClass} rounded-[32px] bg-white/80 backdrop-blur-md shadow-[0_18px_80px_rgba(15,23,42,0.16)]`}>
      {/* Header */}
      <div className={`px-4 pt-4 pb-3 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <button
          onClick={() => {
            // 跳转到首页：取消选中任何视频
            onSelectVideo(null);
          }}
          className="flex items-center gap-2 rounded-full px-2 py-1 text-[13px] font-medium text-slate-900 hover:bg-slate-100/80 transition-colors"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-2xl bg-slate-900">
            <VideoIcon className="h-3.5 w-3.5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="tracking-tight">
              {t('appName')}
            </span>
          )}
        </button>
        {isMobile && !isCollapsed && (
          <button onClick={onToggle} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Video List */}
      <nav className="flex-1 px-2 pt-1 pb-3 overflow-y-auto overflow-x-visible custom-scrollbar">
        {!isCollapsed && (
          <div className="px-4 pb-2">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-2xl bg-slate-100/80 py-1.5 pl-7 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none transition"
                placeholder={t('searchVideos') || t('search')}
              />
            </div>
          </div>
        )}
        {!isCollapsed && (
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {t('myLibrary')}
            </span>
            <div className="relative" ref={sortMenuRef}>
              <button
                type="button"
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-200 transition-colors"
                title={t('sortVideos')}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {sortMode === 'nameAsc' ? t('sortAZ') : 
                   sortMode === 'nameDesc' ? t('sortZA') :
                   sortMode === 'dateDesc' ? t('sortDateNewest') :
                   sortMode === 'dateAsc' ? t('sortDateOldest') :
                   sortMode === 'sizeDesc' ? t('sortSizeLargest') :
                   t('sortSizeSmallest')}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>
              
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white border border-slate-200/60 rounded-2xl py-1 shadow-lg">
                  <button
                    onClick={() => { setSortMode('nameAsc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors ${sortMode === 'nameAsc' ? 'bg-slate-50 text-slate-900 font-medium' : 'text-slate-600'}`}
                  >
                    {t('sortAZ')}
                  </button>
                  <button
                    onClick={() => { setSortMode('nameDesc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors ${sortMode === 'nameDesc' ? 'bg-slate-50 text-slate-900 font-medium' : 'text-slate-600'}`}
                  >
                    {t('sortZA')}
                  </button>
                  <div className="border-t border-slate-200/60 my-1" />
                  <button
                    onClick={() => { setSortMode('dateDesc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors ${sortMode === 'dateDesc' ? 'bg-slate-50 text-slate-900 font-medium' : 'text-slate-600'}`}
                  >
                    {t('sortDateNewest')}
                  </button>
                  <button
                    onClick={() => { setSortMode('dateAsc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors ${sortMode === 'dateAsc' ? 'bg-slate-50 text-slate-900 font-medium' : 'text-slate-600'}`}
                  >
                    {t('sortDateOldest')}
                  </button>
                  <div className="border-t border-slate-200/60 my-1" />
                  <button
                    onClick={() => { setSortMode('sizeDesc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors ${sortMode === 'sizeDesc' ? 'bg-slate-50 text-slate-900 font-medium' : 'text-slate-600'}`}
                  >
                    {t('sortSizeLargest')}
                  </button>
                  <button
                    onClick={() => { setSortMode('sizeAsc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors ${sortMode === 'sizeAsc' ? 'bg-slate-50 text-slate-900 font-medium' : 'text-slate-600'}`}
                  >
                    {t('sortSizeSmallest')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={processedVideos.map((v) => v.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1.5">
              {sortedFolderKeys.map(folderKey => {
                const folderVideos = groupedVideos[folderKey];
                if (folderKey === '__root__') {
                  return folderVideos.map(video => (
                    <VideoItem key={video.id} {...{ video, selectedVideoId, onSelectVideo, isCollapsed, onDeleteVideo }} />
                  ));
                }

                const isExpanded = expandedFolders[folderKey] ?? true;
                return (
                  <FolderItem
                    key={folderKey}
                    folderKey={folderKey}
                    folderVideos={folderVideos}
                    isExpanded={isExpanded}
                    isCollapsed={isCollapsed}
                    isMobile={isMobile}
                    selectedVideoId={selectedVideoId}
                    onSelectVideo={onSelectVideo}
                    onToggleFolder={toggleFolder}
                    onDeleteVideo={onDeleteVideo}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </nav>

      {/* Footer Controls */}
      {isCollapsed && !isMobile ? (
        // 收起态：统一成一列 icon pill
        <div className="flex flex-col items-center gap-1.5 pb-3 pt-2.5 border-t border-slate-100 rounded-[32px] bg-gradient-to-t from-slate-50/80 to-transparent">
          {authService.isAvailable() && (
            <button
              onClick={propCurrentUser ? () => onOpenAccount?.() : () => onOpenAuth?.()}
              className={controlButtonCollapsed}
              aria-label={propCurrentUser ? t('account') : t('signIn')}
            >
              {propCurrentUser ? <UserIcon className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            </button>
          )}
          <div className="relative w-full" ref={importMenuRef}>
            <button
              onClick={handleImportClick}
              className={controlButtonCollapsed}
              aria-label={t('importFile')}
            >
              <FolderInput className="h-4 w-4" />
            </button>
            {showImportMenu && (
              <div className="absolute bottom-full left-0 mb-2 z-50 w-44 bg-white rounded-2xl shadow-lg border border-slate-100 py-1">
                <button
                  onClick={handleImportFileClick}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors text-slate-600"
                >
                  {t('importFile')}
                </button>
                <button
                  onClick={handleImportFolderClick}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors text-slate-600"
                >
                  {t('importFolder')}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => handleExport(false)}
            disabled={exporting}
            className={`${controlButtonCollapsed} ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={t('export')}
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className={controlButtonCollapsed}
            aria-label={t('settings')}
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className={controlButtonCollapsed}
            aria-label={t('expandSidebar')}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        // 展开态：两段布局
        <div className="px-3 pb-3 pt-2.5 border-t border-slate-100 rounded-[32px] bg-gradient-to-t from-slate-50/80 to-transparent space-y-2.5">
          {/* 第一段：账号 + 收起 */}
          <div className="flex items-center justify-between gap-1.5">
            {authService.isAvailable() && (
              <button
                onClick={propCurrentUser ? () => onOpenAccount?.() : () => onOpenAuth?.()}
                className={controlButtonSecondary}
                aria-label={propCurrentUser ? t('account') : t('signIn')}
              >
                {propCurrentUser ? <UserIcon className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                {!isMobile && (
                  <span className="text-xs">
                    {propCurrentUser ? (propCurrentUser.email?.split('@')[0] ?? t('account')) : t('signIn')}
                  </span>
                )}
              </button>
            )}

            {/* 设置 */}
            <button
              onClick={onOpenSettings}
              className={controlButtonGhost}
              aria-label={t('settings')}
            >
              <Settings className="h-4 w-4" />
              {!isMobile && <span className="text-xs">{t('settings')}</span>}
            </button>
          </div>

          {/* 第二段：导入 / 导出 / 设置 */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* 导入 */}
            <div className="relative" ref={importMenuRef}>
              <button
                onClick={handleImportClick}
                className={controlButtonSecondary}
                aria-label={t('importFile')}
              >
                <FolderInput className="h-4 w-4" />
                {!isMobile && <span className="text-xs">{t('importFile')}</span>}
              </button>
              {showImportMenu && (
                <div className="absolute bottom-full left-0 mb-2 z-50 w-44 bg-white rounded-2xl shadow-lg border border-slate-100 py-1">
                  <button
                    onClick={handleImportFileClick}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors text-slate-600"
                  >
                    {t('importFile')}
                  </button>
                  <button
                    onClick={handleImportFolderClick}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors text-slate-600"
                  >
                    {t('importFolder')}
                  </button>
                </div>
              )}
            </div>

            {/* 导出 */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={exporting}
                className={`${controlButtonSecondary} ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label={t('export')}
              >
                <Download className="h-4 w-4" />
                {!isMobile && <span className="text-xs">{exporting ? t('exporting') : t('export')}</span>}
              </button>
              {showExportMenu && (
                <div className="absolute bottom-full left-0 mb-2 z-50 w-44 bg-white rounded-2xl shadow-lg border border-slate-100 py-1">
                  <button
                    onClick={() => handleExport(false)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {t('exportDataOnly')}
                  </button>
                  <button
                    onClick={() => handleExport(true)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {t('exportAll')}
                  </button>
                </div>
              )}
            </div>

            {/* 收起按钮 */}
            {!isMobile && (
              <button
                onClick={onToggle}
                className={controlButtonGhost}
                aria-label={t('collapseSidebar')}
              >
                <PanelLeft className="h-4 w-4" />
                {!isMobile && <span className="text-xs">{t('collapseSidebar')}</span>}
              </button>
            )}
            
          </div>
        </div>
      )}

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