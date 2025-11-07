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
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16 relative">
      <div className="max-w-2xl w-full">
        {/* Hero Section */}
        <div className="mb-16">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 mb-4">
            {t('welcomeTitle')}
          </h1>
          <p className="text-lg md:text-xl text-slate-600 font-light max-w-lg mx-auto">
            {t('welcomeSubtitle')}
          </p>
        </div>
        
        {/* Upload Area */}
        <div 
          className={`relative group transition-all duration-300 ease-out ${isDragging ? 'scale-[1.02]' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className={`relative border-2 rounded-2xl p-12 md:p-16 transition-all duration-300 ${
            isDragging 
              ? 'border-slate-900 bg-slate-50' 
              : 'border-slate-200 bg-white/60 backdrop-blur-sm hover:border-slate-300'
          }`}>
            {/* Upload Icon */}
            <div className="mb-6">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-all duration-300 ${
                isDragging ? 'bg-slate-900 scale-110' : 'bg-slate-100 group-hover:bg-slate-200'
              }`}>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="28" 
                  height="28" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth={2} 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className={`transition-colors ${isDragging ? 'text-white' : 'text-slate-600'}`}
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" x2="12" y1="3" y2="15"></line>
                </svg>
              </div>
            </div>
            
            {/* Text */}
            <p className="text-slate-900 font-medium text-lg mb-2">
              {t('dropTarget')}
            </p>
            <p className="text-slate-500 text-sm mb-8">
              {t('dropTargetHint')}
            </p>
            
            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button 
                onClick={handleImportClick}
                className="w-full sm:w-auto bg-slate-900 text-white hover:bg-slate-800 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 shadow-sm"
              >
                {t('browseFile')}
              </button>
              <button
                onClick={handleImportFolderClick}
                className="w-full sm:w-auto bg-white text-slate-700 hover:bg-slate-50 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 border border-slate-200 shadow-sm"
              >
                {t('importFolder')}
              </button>
            </div>
          </div>
        </div>
        
        {/* Hidden Inputs */}
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
        
        {/* Feature Box */}
        <div className="mt-12 text-left max-w-xl mx-auto">
          <div className="flex items-start gap-3 p-5 rounded-xl bg-white/40 backdrop-blur-sm border border-slate-200/50">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1 text-sm">
                {t('welcomeBoxTitle')}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {t('welcomeBoxText')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;