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
    <div className="flex flex-1 flex-col gap-3 px-6 py-5">
      <div className="flex flex-shrink-0 items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{getStatusText()}</p>
        <button
          onClick={handleExport}
          disabled={!content}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-slate-600 shadow-[0_2px_6px_rgba(15,23,42,0.05)] transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={t('exportNotes')}
          title={t('exportNotes')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4-4 4m0 0-4-4m4 4V4" />
          </svg>
        </button>
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        placeholder={t('notesPlaceholder')}
        className="custom-scrollbar flex-1 w-full resize-none rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm leading-[1.6] text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-slate-300"
        aria-label="Video notes"
      />
    </div>
  );
};

export default NotesPanel;