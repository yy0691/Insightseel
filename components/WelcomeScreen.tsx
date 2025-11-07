import React, { useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface WelcomeScreenProps {
  onImportFiles: (files: FileList) => void;
  onImportFolderSelection: (files: FileList) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onImportFiles, onImportFolderSelection }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { t } = useLanguage();
  
  // Debug: Get environment variables
  const debugInfo = {
    VITE_USE_PROXY: import.meta.env.VITE_USE_PROXY,
    VITE_MODEL: import.meta.env.VITE_MODEL,
    VITE_BASE_URL: import.meta.env.VITE_BASE_URL,
  };

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
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 relative">
      <div className="max-w-xl w-full relative">
        <h1 className="text-6xl font-extrabold tracking-tighter text-slate-900">{t('welcomeTitle')}</h1>
        <p className="text-slate-500 mt-2 mb-10 text-lg">{t('welcomeSubtitle')}</p>
        
        <div 
          className={`border border-dashed rounded-3xl p-10 transition-all duration-300 shadow-lg backdrop-blur-md ${isDragging ? 'border-indigo-500 bg-white/50' : 'border-white/30 bg-white/30'}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto text-slate-500 mb-4">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" x2="12" y1="3" y2="15"></line>
          </svg>
          <p className="text-slate-700 font-medium mb-2">{t('dropTarget')}</p>
          <p className="text-slate-500 text-sm mb-6">{t('dropTargetHint')}</p>
          <div className="flex flex-col items-center">
             <button 
                onClick={handleImportClick}
                className="bg-slate-900 text-slate-50 hover:bg-slate-900/90 inline-flex items-center justify-center rounded-xl text-sm font-medium h-11 px-8 shadow-md"
              >
                {t('browseFile')}
              </button>
               <button
                onClick={handleImportFolderClick}
                className="mt-3 bg-slate-800 text-slate-200 hover:bg-slate-800/90 inline-flex items-center justify-center rounded-xl text-sm font-medium h-11 px-8 shadow-md"
              >
                {t('importFolder')}
              </button>
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
        
        <div className="mt-8 backdrop-blur-md bg-white/30 p-6 rounded-2xl text-left border border-white/30 shadow-lg">
            <h3 className="font-semibold text-slate-900 mb-2">{t('welcomeBoxTitle')}</h3>
            <p className="text-sm text-slate-600">{t('welcomeBoxText')}</p>
        </div>
      
      </div>
    </div>
  );
};

export default WelcomeScreen;