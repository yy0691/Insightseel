import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video, Note } from '../types';
import { noteDB } from '../services/dbService';
import { downloadFile } from '../utils/helpers';
import { useLanguage } from '../contexts/LanguageContext';

const useDebouncedCallback = (callback: (...args: any[]) => void, delay: number) => {
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback((...args: any[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  return debouncedCallback;
};


interface NotesPanelProps {
  video: Video;
  note: Note | null;
}

const NotesPanel: React.FC<NotesPanelProps> = ({ video, note }) => {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'typing' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    setContent(note?.content || '');
    setLastSaved(note ? new Date(note.updatedAt) : null);
    setStatus('idle');
  }, [video.id, note]);

  const saveNote = useCallback(async (newContent: string) => {
      setStatus('saving');
      try {
          const newNote: Note = {
            id: video.id,
            videoId: video.id,
            content: newContent,
            updatedAt: new Date().toISOString(),
          };
          await noteDB.put(newNote);
          setStatus('saved');
          setLastSaved(new Date(newNote.updatedAt));
      } catch (error) {
          console.error('Failed to save note:', error);
          setStatus('idle');
      }
  }, [video.id]);

  const debouncedSave = useDebouncedCallback(saveNote, 1000);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setContent(newContent);
      setStatus('typing');
      debouncedSave(newContent);
  };
  
  const getStatusText = () => {
      switch (status) {
          case 'typing':
              return t('statusTyping');
          case 'saving':
              return t('statusSaving');
          case 'saved':
              return t('statusSaved');
          case 'idle':
              return lastSaved ? t('statusLastSaved', lastSaved.toLocaleTimeString()) : t('statusReady');
      }
  };

  const handleExport = () => {
    const fileName = `${video.name.replace(/\.[^/.]+$/, "")}-notes.txt`;
    downloadFile(content, fileName, 'text/plain');
  };

  return (
    <div className="flex flex-col flex-1 p-2">
      <div className="flex-shrink-0 flex justify-between items-center mb-2">
        <p className="text-xs text-slate-500 italic">
          {getStatusText()}
        </p>
         <button
            onClick={handleExport}
            disabled={!content}
            className="text-xs backdrop-blur-sm bg-white/50 hover:bg-white/80 border border-white/20 text-slate-800 font-medium p-1.5 rounded-xl transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t('exportNotes')}
            title={t('exportNotes')}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        </button>
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        placeholder={t('notesPlaceholder')}
        className="flex-1 w-full bg-white/40 rounded-xl p-3 text-sm border border-white/20 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition resize-none backdrop-blur-sm custom-scrollbar"
        aria-label="Video notes"
      />
    </div>
  );
};

export default NotesPanel;