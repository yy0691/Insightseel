import React, { useState, useEffect, useRef } from 'react';
import { Video, Subtitles, Analysis, ChatMessage, ChatHistory } from '../types';
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
  analyses?: Analysis[];
  screenshotDataUrl: string | null;
  onClearScreenshot: () => void;
  onSeekToTime: (timeInSeconds: number) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ video, subtitles, analyses, screenshotDataUrl, onClearScreenshot, onSeekToTime }) => {
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
        
        // Build transcript context
        const subtitlesText = subtitles ? subtitles.segments.map(s => s.text).join(' ') : null;

        // Build insights context from analyses (summary, key-info, topics)
        const analysesContext = analyses && analyses.length > 0
          ? analyses.map(a => {
              const label = a.type === 'summary' ? 'Summary' : a.type === 'key-info' ? 'Key Information' : 'Topics';
              return `[${label}]\n${a.result}`;
            }).join('\n\n')
          : null;

        const contextParts: string[] = [];
        if (subtitlesText) contextParts.push(`[Transcript]\n${subtitlesText}`);
        if (analysesContext) contextParts.push(analysesContext);
        const fullContext = contextParts.length > 0 ? contextParts.join('\n\n') : null;

        const targetLanguageName = language === 'zh' ? 'Chinese' : 'English';
        const systemInstruction = t('chatSystemInstruction', targetLanguageName);

        const responseText = await generateChatResponse(
            apiHistory,
            { text: userMessage.text, imageB64DataUrl: screenshotDataUrl || undefined },
            { frames },
            fullContext,
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
    <div className="flex flex-col h-full">
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto pr-2 space-y-4 p-4 custom-scrollbar">
        {history.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs md:max-w-md lg:max-w-lg rounded-2xl px-4 py-2 shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'backdrop-blur-sm bg-slate-200/60 text-slate-800'}`}>
                {msg.role === 'user' && msg.image && (
                    <img src={msg.image} alt="user screenshot" className="w-full rounded-md mb-2 max-h-48 object-contain bg-black/20"/>
                )}
                <div className="text-sm">
                  <MarkdownRenderer
                    content={msg.text}
                    onTimestampClick={onSeekToTime}
                  />
                </div>
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                 <div className="max-w-xs rounded-2xl px-4 py-3 backdrop-blur-sm bg-slate-200/60 text-slate-800">
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                    </div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex-shrink-0 p-4 border-t border-gray-200">
        {screenshotDataUrl && (
            <div className="p-1 border bg-white rounded-xl mb-2 relative inline-block shadow-md">
                <img src={screenshotDataUrl} alt="Screenshot to send" className="w-16 h-16 object-cover rounded-md"/>
                <button
                    onClick={onClearScreenshot}
                    className="absolute -top-2 -right-2 bg-slate-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-sm leading-none hover:bg-black"
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
                className="flex text-sm w-full border px-3 py-2 rounded-[20px] bg-neutral-100 border-[#ebecee] pr-11 resize-none max-h-40 focus:outline-none focus:ring-2 focus:ring-indigo-400 custom-scrollbar"
                disabled={isLoading}
            />
            <button 
                onClick={handleSendMessage} 
                disabled={isLoading || !currentMessage.trim()} 
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full inline-flex items-center justify-center bg-slate-800 text-white disabled:bg-slate-400 hover:bg-slate-700 transition-colors"
                aria-label={t('sendMessage')}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                </svg>
            </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;