import React, { useState, useEffect, useRef } from 'react';
import { Video, Subtitles, ChatMessage, ChatHistory } from '../types';
import { generateChatResponse } from '../services/geminiService';
import { Content } from '@google/genai';
import MarkdownRenderer from './MarkdownRenderer';
import { useLanguage } from '../contexts/LanguageContext';
import { extractFramesFromVideo } from '../utils/helpers';
import { chatDB } from '../services/dbService';
import { saveChatHistory as persistChatHistory } from '../services/chatService';

interface ChatPanelProps {
  video: Video;
  subtitles: Subtitles | null;
  screenshotDataUrl: string | null;
  onClearScreenshot: () => void;
  onSeekToTime: (timeInSeconds: number) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ video, subtitles, screenshotDataUrl, onClearScreenshot, onSeekToTime }) => {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const { t, language } = useLanguage();

  // Load chat history when video changes
  useEffect(() => {
    let isMounted = true;

    const loadChatHistory = async () => {
      try {
        const chatHistory = await chatDB.get(video.id);
        if (isMounted) {
          setHistory(chatHistory?.messages || []);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        if (isMounted) {
          setHistory([]);
        }
      }
    };

    loadChatHistory();

    return () => {
      isMounted = false;
    };
  }, [video.id]);

  // Save chat history when it changes
  useEffect(() => {
    const saveHistory = async () => {
      if (history.length === 0) return;

      try {
        const chatHistory: ChatHistory = {
          id: video.id,
          videoId: video.id,
          messages: history,
          updatedAt: new Date().toISOString(),
        };
        await persistChatHistory(chatHistory);
      } catch (error) {
        console.error('Failed to save chat history:', error);
      }
    };

    saveHistory();
  }, [history, video.id]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [history, isLoading]);

  useEffect(() => {
    // Auto-resize textarea
    if (textAreaRef.current) {
        const currentScrollY = window.scrollY;
        textAreaRef.current.style.height = 'auto';
        textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
        window.scrollTo(0, currentScrollY);
    }
  }, [currentMessage]);
  
  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = { 
        role: 'user', 
        text: currentMessage,
        image: screenshotDataUrl || undefined,
    };
    
    // Update UI immediately
    setHistory(prev => [...prev, userMessage]);
    setCurrentMessage('');
    if (screenshotDataUrl) onClearScreenshot();
    setIsLoading(true);

    try {
        const isFirstMessage = history.filter(h => h.role === 'user').length === 0;
        let frames: string[] | undefined = undefined;

        if (isFirstMessage) {
            const MAX_FRAMES_FOR_CHAT = 30; // Use fewer frames for chat for faster response
            frames = await extractFramesFromVideo(video.file, MAX_FRAMES_FOR_CHAT, () => {}); // No progress reporting needed for chat
        }

        // Convert previous ChatMessage[] to Content[] for the API
        const apiHistory: Content[] = history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }] // For simplicity, we don't re-send old images in history
        }));
        
        const subtitlesText = subtitles ? subtitles.segments.map(s => s.text).join(' ') : null;
        const targetLanguageName = language === 'zh' ? 'Chinese' : 'English';
        const systemInstruction = t('chatSystemInstruction', targetLanguageName);

        const responseText = await generateChatResponse(
            apiHistory,
            { text: userMessage.text, imageB64DataUrl: screenshotDataUrl || undefined },
            { frames },
            subtitlesText,
            systemInstruction
        );
        
        const modelMessage: ChatMessage = { role: 'model', text: responseText };
        setHistory(prev => [...prev, modelMessage]);

    } catch (error) {
        console.error("Chat error:", error);
        const text = error instanceof Error ? `Error: ${error.message}` : "Sorry, I encountered an error. Please try again.";
        const errorMessage: ChatMessage = { role: 'model', text };
        setHistory(prev => [...prev, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 px-6 py-5">
      <div ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
        {history.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-sm rounded-2xl px-4 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.1)] md:max-w-md lg:max-w-lg ${
                msg.role === 'user'
                  ? 'bg-slate-900 text-white'
                  : 'border border-[#E5E7EB] bg-white text-slate-700'
              }`}
            >
              {msg.role === 'user' && msg.image && (
                <img src={msg.image} alt="user screenshot" className="mb-3 w-full max-h-48 rounded-xl object-cover" />
              )}
              <div className="text-sm leading-[1.65]">
                <MarkdownRenderer content={msg.text} onTimestampClick={onSeekToTime} />
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-sm rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.1)]">
              <div className="flex items-center space-x-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-slate-500"></div>
                <div className="h-2 w-2 animate-pulse rounded-full bg-slate-500 [animation-delay:0.2s]"></div>
                <div className="h-2 w-2 animate-pulse rounded-full bg-slate-500 [animation-delay:0.4s]"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex-shrink-0">
        {screenshotDataUrl && (
          <div className="relative mb-2 inline-block rounded-xl border border-[#E5E7EB] bg-white p-1 shadow-[0_12px_24px_rgba(15,23,42,0.1)]">
            <img src={screenshotDataUrl} alt="Screenshot to send" className="h-16 w-16 rounded-lg object-cover" />
            <button
              onClick={onClearScreenshot}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-sm text-white shadow hover:bg-black"
              aria-label="Remove screenshot"
            >
              &times;
            </button>
          </div>
        )}
        <div className="relative">
          <textarea
            ref={textAreaRef}
            rows={1}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={t('askQuestion')}
            className="custom-scrollbar flex max-h-40 w-full resize-none rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 pr-12 text-sm text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-slate-300"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !currentMessage.trim()}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            aria-label={t('sendMessage')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;