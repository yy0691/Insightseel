import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardCopy, Trash2 } from 'lucide-react';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  msg: string;
}

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  info:    'text-gray-400',
  warn:    'text-yellow-400',
  error:   'text-red-400',
  success: 'text-green-400',
};

const LEVEL_DOT: Record<LogLevel, string> = {
  info:    'bg-gray-500',
  warn:    'bg-yellow-400',
  error:   'bg-red-400',
  success: 'bg-green-400',
};

export const GenerationLogPanel: React.FC<Props> = ({ logs, onClear }) => {
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(logs.length);

  // Auto-expand when first log arrives, auto-scroll on new entries
  useEffect(() => {
    if (logs.length > 0 && prevCountRef.current === 0) {
      setExpanded(true);
    }
    if (logs.length > prevCountRef.current && expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = logs.length;
  }, [logs.length, expanded]);

  if (logs.length === 0) return null;

  const handleCopy = () => {
    const text = logs.map(e => `[${e.ts}] [${e.level.toUpperCase()}] ${e.msg}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const newCount = logs.length - (expanded ? logs.length : 0);

  return (
    <div className="mt-2 rounded-lg border border-gray-700 bg-gray-900 text-xs font-mono overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2 text-gray-300">
          <span className="font-semibold">Generation Log</span>
          {!expanded && newCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
              {logs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <button
            onClick={e => { e.stopPropagation(); handleCopy(); }}
            className="p-0.5 hover:text-gray-200 transition-colors"
            title="Copy all logs"
          >
            <ClipboardCopy size={12} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            className="p-0.5 hover:text-red-400 transition-colors"
            title="Clear logs"
          >
            <Trash2 size={12} />
          </button>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Log entries */}
      {expanded && (
        <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-0.5 border-t border-gray-700">
          {logs.map(entry => (
            <div key={entry.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-gray-600 shrink-0 w-[7ch]">{entry.ts}</span>
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[entry.level]}`} />
              <span className={LEVEL_COLOR[entry.level]}>{entry.msg}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
};
